import type { Client, InStatement, InValue } from "@apisurf/ngn-persistence";
import { toMs, type Duration } from "../duration.js";
import { runMigrations } from "../taskSqlite.js";
import { QUEUE_MIGRATIONS, type JobRow, type JobStatus } from "./schema.js";
import { work, type WorkHandler, type WorkOptions, type WorkSummary } from "./work.js";

/** What a queue knows about the run that opened it. */
export interface QueueRunContext {
  /** The task's next tick, for `"next-tick"` backoff. */
  nextAt: number | null;
  /** The run's deadline signal, `work()`'s default `until`. */
  signal?: AbortSignal;
}

/**
 * When a failed job may be tried again:
 *
 * - `"next-tick"` (default): not before the task's next scheduled run, so a
 *   retry never competes with the run that is failing. Without a schedule it
 *   is straight away.
 * - a duration: that long after the failure.
 * - `{ base, max }`: `base`, doubling with each attempt, never above `max`.
 */
export type Backoff = "next-tick" | Duration | { base: Duration; max?: Duration };

export interface QueueOptions {
  /**
   * The database the queue lives in: any `ctx.sqlite.initDB(...)` instance,
   * or `ctx.sqlite` itself (the default). Keeping it next to your own tables is
   * what lets `addStatement` go in the same batch as the row a job is about.
   */
  db?: { client: Client };
  /** Attempts a job gets before it is `dead`. Default 3. */
  maxAttempts?: number;
  backoff?: Backoff;
  /** How long a claim lasts before the job is claimable again. Default 10 minutes. */
  lease?: Duration;
}

export interface AddJob<T> {
  /** De-duplicates: a key already in this queue, in any status, is not added again. */
  key?: string;
  /** Groups are served fairly and never two at once by `work()`; e.g. a host. */
  group?: string;
  payload?: T;
  /** Higher first, within a group. Default 0. */
  priority?: number;
  /** Not before this long from now. */
  delay?: Duration;
  /** Overrides the queue's `maxAttempts` for this job. */
  maxAttempts?: number;
}

export interface Job<T> {
  id: number;
  key: string | null;
  group: string | null;
  payload: T;
  priority: number;
  /** Attempts so far, this one included. */
  attempts: number;
  maxAttempts: number;
  /** The error the previous attempt failed with. */
  lastError: string | null;
  createdAt: number;
}

export interface ClaimOptions {
  limit: number;
  /** At most this many jobs per group. */
  perGroup?: number;
  /** Leave these groups' jobs where they are. */
  skipGroups?: readonly string[];
  /** Leave these jobs where they are, e.g. ones this run already tried. */
  skipIds?: readonly number[];
}

/** Which jobs `park`, `reopen` and `prune` act on. Fields combine with AND. */
export interface JobFilter {
  group?: string | readonly string[];
  /** Every group except these. Jobs with no group match. */
  groupNotIn?: readonly string[];
  key?: string | readonly string[];
}

export interface QueueStats {
  ready: number;
  /** Ready jobs whose `run_after` has passed: what a claim could take now. */
  due: number;
  leased: number;
  done: number;
  dead: number;
  parked: number;
  /** How long the oldest ready job has waited since it was added, or null. */
  oldestReadyAgeMs: number | null;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 10 * 60_000;
const MAX_ERROR_LENGTH = 2_000;

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");
const asList = (value: string | readonly string[]) => (typeof value === "string" ? [value] : value);

function toJob<T>(row: JobRow): Job<T> {
  return {
    id: row.id,
    key: row.key,
    group: row.grp,
    payload: (row.payload == null ? undefined : JSON.parse(row.payload)) as T,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, MAX_ERROR_LENGTH);
}

/** `filter` as a WHERE fragment over `_ngn_jobs`, and its arguments. */
function filterSql(filter: JobFilter): { sql: string; args: InValue[] } {
  const parts: string[] = [];
  const args: InValue[] = [];

  if (filter.group != null) {
    const groups = asList(filter.group);
    parts.push(groups.length ? `grp IN (${placeholders(groups.length)})` : "0");
    args.push(...groups);
  }
  if (filter.groupNotIn?.length) {
    parts.push(`(grp IS NULL OR grp NOT IN (${placeholders(filter.groupNotIn.length)}))`);
    args.push(...filter.groupNotIn);
  }
  if (filter.key != null) {
    const keys = asList(filter.key);
    parts.push(keys.length ? `key IN (${placeholders(keys.length)})` : "0");
    args.push(...keys);
  }

  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", args };
}

/**
 * A named queue over `_ngn_jobs` in one database.
 *
 * Every state change is a single statement guarded by what the caller saw, so
 * two runs (or two processes) working one queue cannot both take a job, and a
 * run whose lease ran out cannot settle a job someone else has since claimed.
 */
export class Queue<T = unknown> {
  private readonly maxAttempts: number;
  private readonly leaseMs: number;

  constructor(
    private readonly client: Client,
    readonly name: string,
    private readonly options: QueueOptions,
    private readonly run: QueueRunContext,
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.leaseMs = options.lease == null ? DEFAULT_LEASE_MS : toMs(options.lease, "queue lease");
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error(`Invalid maxAttempts for queue "${name}": expected a whole number above 0`);
    }
  }

  /**
   * The INSERT for one job, to run in your own `batch` beside the row the job
   * is about. A key already in the queue makes it a no-op.
   */
  addStatement(job: AddJob<T>): { sql: string; args: InValue[] } {
    const now = Date.now();
    return {
      sql: `INSERT INTO _ngn_jobs
              (queue, key, grp, payload, priority, status, attempts, max_attempts, run_after, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ready', 0, ?, ?, ?, ?)
            ON CONFLICT (queue, key) DO NOTHING`,
      args: [
        this.name,
        job.key ?? null,
        job.group ?? null,
        job.payload === undefined ? null : JSON.stringify(job.payload),
        job.priority ?? 0,
        job.maxAttempts ?? this.maxAttempts,
        now + (job.delay == null ? 0 : toMs(job.delay, "job delay")),
        now,
        now,
      ],
    };
  }

  /** Add one job or several. Returns how many were new; the rest had keys already queued. */
  async add(jobs: AddJob<T> | readonly AddJob<T>[]): Promise<number> {
    const list = Array.isArray(jobs) ? jobs : [jobs as AddJob<T>];
    if (list.length === 0) return 0;
    const results = await this.client.batch(
      list.map((job) => this.addStatement(job)),
      "write",
    );
    return results.reduce((sum, result) => sum + result.rowsAffected, 0);
  }

  /**
   * Take up to `limit` jobs that are due, counting an attempt on each and
   * leasing them for the queue's `lease`.
   *
   * With groups, the jobs are drawn a group at a time: every group's first job
   * before any group's second, groups in a fresh random order each claim. So
   * a claim spreads over as many groups as it can, and when `limit` cuts a
   * round short it is not always the same groups left out.
   */
  async claim({ limit, perGroup, skipGroups = [], skipIds = [] }: ClaimOptions): Promise<Job<T>[]> {
    if (limit <= 0) return [];
    const now = Date.now();
    const skip = skipGroups.length
      ? `AND (grp IS NULL OR grp NOT IN (${placeholders(skipGroups.length)}))`
      : "";

    const [, claimed] = await this.client.batch(
      [
        this.retireStatement(now),
        {
          sql: `UPDATE _ngn_jobs
                SET status = 'leased', lease_until = ?, attempts = attempts + 1, updated_at = ?
                WHERE id IN (
                  SELECT id FROM (
                    SELECT id, grp, priority, run_after,
                           ROW_NUMBER() OVER (
                             PARTITION BY COALESCE(grp, 'id:' || id)
                             ORDER BY priority DESC, run_after, id
                           ) AS turn
                    FROM _ngn_jobs
                    WHERE queue = ?
                      AND attempts < max_attempts
                      AND ((status = 'ready' AND run_after <= ?)
                        OR (status = 'leased' AND lease_until <= ?))
                      ${skip}
                      AND id NOT IN (SELECT value FROM json_each(?))
                  )
                  WHERE turn <= ?
                  ORDER BY turn, CASE WHEN grp IS NULL THEN NULL ELSE random() END,
                           priority DESC, run_after, id
                  LIMIT ?
                )
                RETURNING *`,
          args: [
            now + this.leaseMs,
            now,
            this.name,
            now,
            now,
            ...skipGroups,
            // One JSON parameter however many ids, rather than one per id.
            JSON.stringify(skipIds),
            perGroup ?? Number.MAX_SAFE_INTEGER,
            limit,
          ],
        },
      ],
      "write",
    );

    // RETURNING comes back in no particular order; hand jobs out in claim order.
    return (claimed.rows as unknown as JobRow[])
      .toSorted((a, b) => b.priority - a.priority || a.run_after - b.run_after || a.id - b.id)
      .map((row) => toJob<T>(row));
  }

  /**
   * Jobs whose lease ran out on their last attempt: no claim will take them
   * again, so they are marked `dead` rather than left looking leased forever.
   */
  private retireStatement(now: number): InStatement {
    return {
      sql: `UPDATE _ngn_jobs
            SET status = 'dead', lease_until = NULL, updated_at = ?,
                last_error = COALESCE(last_error, 'lease expired')
            WHERE queue = ? AND status = 'leased' AND lease_until <= ? AND attempts >= max_attempts`,
      args: [now, this.name, now],
    };
  }

  /**
   * Settle a claimed job, if the claim is still ours: same job, same attempt,
   * still leased. False when the lease expired and the job moved on.
   */
  private async settle(job: Job<T>, set: string, args: InValue[]): Promise<boolean> {
    const { rowsAffected } = await this.client.execute({
      sql: `UPDATE _ngn_jobs SET ${set}, updated_at = ?
            WHERE id = ? AND queue = ? AND status = 'leased' AND attempts = ?`,
      args: [...args, Date.now(), job.id, this.name, job.attempts],
    });
    return rowsAffected > 0;
  }

  /** The job is finished. */
  complete(job: Job<T>): Promise<boolean> {
    return this.settle(job, "status = 'done', lease_until = NULL, last_error = NULL", []);
  }

  /**
   * The attempt failed. The job backs off and is tried again, or is `dead`
   * once it has had all its attempts. `delay` overrides the backoff.
   */
  fail(job: Job<T>, error: unknown, { delay }: { delay?: Duration } = {}): Promise<boolean> {
    const runAfter = Date.now() + (delay == null ? this.backoffMs(job.attempts) : toMs(delay));
    return this.settle(
      job,
      `status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'ready' END,
       lease_until = NULL, last_error = ?, run_after = ?`,
      [errorText(error), runAfter],
    );
  }

  /**
   * Hand a claimed job back unworked. By default the attempt is refunded: for
   * a job that never got a fair try, such as a site that walled the run.
   */
  release(
    job: Job<T>,
    { delay, refund = true }: { delay?: Duration; refund?: boolean } = {},
  ): Promise<boolean> {
    const runAfter = Date.now() + (delay == null ? 0 : toMs(delay));
    return this.settle(
      job,
      `status = 'ready', lease_until = NULL, run_after = ?,
       attempts = ${refund ? "MAX(attempts - 1, 0)" : "attempts"}`,
      [runAfter],
    );
  }

  /** How long a job that just failed its `attempts`th attempt waits. */
  private backoffMs(attempts: number): number {
    const { backoff = "next-tick" } = this.options;
    if (backoff === "next-tick") {
      const { nextAt } = this.run;
      return nextAt == null ? 0 : Math.max(0, nextAt - Date.now());
    }
    if (typeof backoff === "object") {
      const base = toMs(backoff.base, "backoff base");
      const max = backoff.max == null ? Number.POSITIVE_INFINITY : toMs(backoff.max, "backoff max");
      return Math.min(max, base * 2 ** Math.max(0, attempts - 1));
    }
    return toMs(backoff, "backoff");
  }

  /**
   * Set ready jobs aside, e.g. ones no handler can read yet. Parked jobs are
   * never claimed until `reopen`. Returns how many were parked.
   */
  async park(filter: JobFilter, reason?: string): Promise<number> {
    const where = filterSql(filter);
    const { rowsAffected } = await this.client.execute({
      sql: `UPDATE _ngn_jobs SET status = 'parked', last_error = COALESCE(?, last_error), updated_at = ?
            WHERE queue = ? AND status = 'ready'${where.sql}`,
      args: [reason ?? null, Date.now(), this.name, ...where.args],
    });
    return rowsAffected;
  }

  /**
   * Make jobs ready again with their attempts reset: parked ones by default,
   * or any of `from`, e.g. `["dead"]` to retry what gave up.
   */
  async reopen(
    filter: JobFilter = {},
    { from = ["parked"] }: { from?: readonly Exclude<JobStatus, "leased" | "ready">[] } = {},
  ): Promise<number> {
    if (from.length === 0) return 0;
    const where = filterSql(filter);
    const now = Date.now();
    const { rowsAffected } = await this.client.execute({
      sql: `UPDATE _ngn_jobs SET status = 'ready', attempts = 0, run_after = ?, updated_at = ?
            WHERE queue = ? AND status IN (${placeholders(from.length)})${where.sql}`,
      args: [now, now, this.name, ...from, ...where.args],
    });
    return rowsAffected;
  }

  /**
   * Delete finished jobs last touched more than `olderThan` ago, `done` ones by
   * default. A pruned key can be added again.
   */
  async prune({
    olderThan,
    status = ["done"],
  }: {
    olderThan: Duration;
    status?: readonly Exclude<JobStatus, "leased" | "ready">[];
  }): Promise<number> {
    if (status.length === 0) return 0;
    const { rowsAffected } = await this.client.execute({
      sql: `DELETE FROM _ngn_jobs
            WHERE queue = ? AND status IN (${placeholders(status.length)}) AND updated_at < ?`,
      args: [this.name, ...status, Date.now() - toMs(olderThan, "prune age")],
    });
    return rowsAffected;
  }

  /**
   * Work through the queue until it is empty, `max` is reached or the run's
   * deadline passes, `concurrency` jobs at a time and never two of one group
   * at once. A handler that returns completes its job; one that throws fails
   * it. Whatever is left waits for the next run.
   */
  // NoInfer: the resource type comes from `worker.setup`, not from the handler's parameter.
  work<W = undefined>(
    handler: WorkHandler<T, NoInfer<W>>,
    options: WorkOptions<W> = {},
  ): Promise<WorkSummary> {
    return work(this, handler, { until: this.run.signal, ...options });
  }

  /** The job with `key`, in whatever state it is in. */
  async get(key: string): Promise<(Job<T> & { status: JobStatus }) | null> {
    const { rows } = await this.client.execute({
      sql: "SELECT * FROM _ngn_jobs WHERE queue = ? AND key = ?",
      args: [this.name, key],
    });
    const row = rows[0] as unknown as JobRow | undefined;
    return row ? { ...toJob<T>(row), status: row.status } : null;
  }

  async stats(): Promise<QueueStats> {
    const now = Date.now();
    const { rows } = await this.client.execute({
      sql: `SELECT
              COUNT(*) FILTER (WHERE status = 'ready')                       AS ready,
              COUNT(*) FILTER (WHERE status = 'ready' AND run_after <= ?)    AS due,
              COUNT(*) FILTER (WHERE status = 'leased')                      AS leased,
              COUNT(*) FILTER (WHERE status = 'done')                        AS done,
              COUNT(*) FILTER (WHERE status = 'dead')                        AS dead,
              COUNT(*) FILTER (WHERE status = 'parked')                      AS parked,
              MIN(created_at) FILTER (WHERE status = 'ready')                AS oldest
            FROM _ngn_jobs WHERE queue = ?`,
      args: [now, this.name],
    });
    const row = rows[0] as unknown as Record<string, number | null>;
    return {
      ready: Number(row.ready),
      due: Number(row.due),
      leased: Number(row.leased),
      done: Number(row.done),
      dead: Number(row.dead),
      parked: Number(row.parked),
      oldestReadyAgeMs: row.oldest == null ? null : now - Number(row.oldest),
    };
  }
}

/** Open `name` on `client`, creating the table on first use. */
export async function openQueue<T>(
  client: Client,
  name: string,
  options: QueueOptions,
  run: QueueRunContext,
): Promise<Queue<T>> {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`A queue name must be a non-empty string, got ${JSON.stringify(name)}`);
  }
  await runMigrations(client, QUEUE_MIGRATIONS);
  return new Queue<T>(client, name, options, run);
}
