/**
 * What `ngn status`, `runs`, `show` and `logs` read, over the run database.
 *
 * The questions are the ones ngnui asks (packages/ui/src/server/queries.ts),
 * asked through libsql instead of better-sqlite3; what the answers mean —
 * Stalled, skip reasons, the filter language — comes from the shared describe
 * module, so the terminal and the dashboard agree. The file is opened without
 * migrating it: columns a later ngn added read as NULL on an older file.
 */
import { openDbClient } from "@apisurf/ngn-persistence";
import {
  describeTask,
  isStalled,
  LIFECYCLE_MESSAGES,
  LIFECYCLE_PREFIX,
  OVERLAP_REASON,
  type RunToken,
  runFilterSql,
  runWindowMs,
} from "@apisurf/ngn-schema/describe";

type Client = ReturnType<typeof openDbClient>;
type Value = string | number | null;

const LIFECYCLE_IN = `(${LIFECYCLE_MESSAGES.map((m) => `'${m.replace(/'/g, "''")}'`).join(", ")})`;
const taskLine = (column: string) =>
  `(${column} NOT IN ${LIFECYCLE_IN} AND ${column} NOT LIKE '${LIFECYCLE_PREFIX}%')`;

export interface TaskRow {
  id: number;
  path: string;
  /** Code sent from the Editor, not one of the project's tasks. */
  editor: boolean;
  file: string;
  run_count: number;
  last_run_id: number | null;
  last_status: string | null;
  last_run_at: number | null;
  last_skip_reason: string | null;
  /** The latest run that reached a verdict. */
  last_outcome: "success" | "failure" | null;
  avg_ms: number | null;
}

export interface RunRow {
  id: number;
  task_id: number;
  path: string;
  editor: boolean;
  version: number | null;
  status: string;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  duration_ms: number | null;
  retry_of: number | null;
  skip_reason: string | null;
  blocked_by: number | null;
  stalled: boolean;
}

export interface StalledRun {
  run_id: number;
  task_id: number;
  started_at: number;
  window_ms: number;
  lease_expired: boolean;
  skipped_since: number;
}

export interface LockRow {
  name: string;
  run_id: number | null;
  expires_at: number;
}

export interface LogRow {
  id: number;
  run_id: number;
  task_id: number;
  path: string;
  status: string;
  value: string;
  created_at: number;
}

export interface TimingRow {
  label: string;
  value: number;
  created_at: number;
}

export class RunStore {
  private columnsCache: { result: boolean; retryOf: boolean; skipReason: boolean } | null = null;
  private constructor(private readonly client: Client) {}

  /** A read-only session that leaves the journal mode of someone else's file alone. */
  static open(dbPath: string): RunStore {
    return new RunStore(openDbClient(`file:${dbPath}`, { wal: false }));
  }

  close() {
    this.client.close();
  }

  private async all<T>(sql: string, args: Value[] = []): Promise<T[]> {
    const { rows } = await this.client.execute({ sql, args });
    return rows as unknown as T[];
  }

  private async columns() {
    if (!this.columnsCache) {
      const names = new Set(
        (await this.all<{ name: string }>("SELECT name FROM pragma_table_info('task_runs')")).map(
          (c) => c.name,
        ),
      );
      this.columnsCache = {
        result: names.has("result"),
        retryOf: names.has("retry_of"),
        skipReason: names.has("skip_reason"),
      };
    }
    return this.columnsCache;
  }

  async tasks(): Promise<TaskRow[]> {
    const col = await this.columns();
    const rows = await this.all<Omit<TaskRow, "editor" | "file">>(
      `WITH r AS (
         SELECT file_task_id, COUNT(*) AS run_count, MAX(id) AS last_run_id,
                MAX(CASE WHEN status IN ('success', 'failure') THEN id END) AS last_outcome_id,
                AVG(ended_at - started_at) AS avg_ms
         FROM task_runs GROUP BY file_task_id
       )
       SELECT t.id, t.path, COALESCE(r.run_count, 0) AS run_count, r.last_run_id,
              lr.status AS last_status, COALESCE(lr.started_at, lr.created_at) AS last_run_at,
              ${col.skipReason ? "lr.skip_reason" : "NULL"} AS last_skip_reason,
              lo.status AS last_outcome, r.avg_ms
       FROM file_tasks t
       LEFT JOIN r ON r.file_task_id = t.id
       LEFT JOIN task_runs lr ON lr.id = r.last_run_id
       LEFT JOIN task_runs lo ON lo.id = r.last_outcome_id
       ORDER BY t.path`,
    );
    return rows.map((row) => {
      const name = describeTask(row.path);
      return Object.assign(row, { editor: name.editor, file: name.file });
    });
  }

  async latestCode(taskId: number): Promise<string | null> {
    const [row] = await this.all<{ compiled_code: string }>(
      "SELECT compiled_code FROM file_task_versions WHERE file_task_id = ? ORDER BY version DESC LIMIT 1",
      [taskId],
    );
    return row?.compiled_code ?? null;
  }

  async locks(): Promise<LockRow[]> {
    const [table] = await this.all(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'locks'",
    );
    if (!table) return [];
    return this.all<LockRow>(
      "SELECT name, task_run_id AS run_id, expires_at FROM locks ORDER BY name",
    );
  }

  /** Every Stalled run, by id, against the clock `now`. The rule is the glossary's. */
  async stalledRuns(now: number): Promise<Map<number, StalledRun>> {
    const col = await this.columns();
    const open = await this.all<{
      id: number;
      task_id: number;
      status: string;
      created_at: number;
      started_at: number | null;
    }>(
      `SELECT id, file_task_id AS task_id, status, created_at, started_at
       FROM task_runs WHERE status IN ('running', 'pending') AND ended_at IS NULL`,
    );
    const out = new Map<number, StalledRun>();
    if (open.length === 0) return out;
    const expired = new Set(
      (await this.locks())
        .filter((l) => l.expires_at <= now && l.run_id != null)
        .map((l) => l.run_id!),
    );
    const windows = new Map<number, number>();
    for (const run of open) {
      if (!windows.has(run.task_id))
        windows.set(run.task_id, runWindowMs(await this.latestCode(run.task_id)));
      const window = windows.get(run.task_id)!;
      const leaseExpired = expired.has(run.id);
      if (!isStalled({ ...run, ended_at: null }, now, window, leaseExpired)) continue;
      const [skipped] = col.skipReason
        ? await this.all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM task_runs
             WHERE file_task_id = ? AND id > ? AND status = 'skipped' AND skip_reason = ?`,
            [run.task_id, run.id, OVERLAP_REASON],
          )
        : [{ n: 0 }];
      out.set(run.id, {
        run_id: run.id,
        task_id: run.task_id,
        started_at: run.started_at ?? run.created_at,
        window_ms: window,
        lease_expired: leaseExpired,
        skipped_since: skipped?.n ?? 0,
      });
    }
    return out;
  }

  private async runSelect() {
    const col = await this.columns();
    const blockedBy = col.skipReason
      ? `CASE WHEN r.status = 'skipped' AND r.skip_reason = '${OVERLAP_REASON}' THEN (
           SELECT b.id FROM task_runs b
           WHERE b.file_task_id = r.file_task_id AND b.id < r.id
             AND b.started_at IS NOT NULL AND b.started_at <= r.created_at
             AND (b.ended_at IS NULL OR b.ended_at >= r.created_at)
           ORDER BY b.id DESC LIMIT 1) END`
      : "NULL";
    return `SELECT r.id, r.file_task_id AS task_id, t.path, v.version, r.status,
              r.created_at, r.started_at, r.ended_at,
              CASE WHEN r.ended_at IS NOT NULL AND r.started_at IS NOT NULL
                   THEN r.ended_at - r.started_at END AS duration_ms,
              ${col.retryOf ? "r.retry_of" : "NULL"} AS retry_of,
              ${col.skipReason ? "r.skip_reason" : "NULL"} AS skip_reason,
              ${blockedBy} AS blocked_by
            FROM task_runs r
            JOIN file_tasks t ON t.id = r.file_task_id
            LEFT JOIN file_task_versions v ON v.id = r.file_task_version_id`;
  }

  /**
   * Runs newest first, filtered by the shared filter tokens (see `runFilterSql`).
   */
  async runs(tokens: readonly RunToken[], now: number, limit = 50): Promise<RunRow[]> {
    const stalled = await this.stalledRuns(now);
    const paths = (await this.all<{ path: string }>("SELECT path FROM file_tasks")).map(
      (r) => r.path,
    );
    const { where, args } = runFilterSql(tokens, { paths, stalledIds: [...stalled.keys()] });

    const rows = await this.all<Omit<RunRow, "stalled" | "editor">>(
      `${await this.runSelect()}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY r.id DESC LIMIT ${Math.min(Math.max(limit, 1), 5000)}`,
      args,
    );
    return rows.map((row) =>
      Object.assign(row, { editor: describeTask(row.path).editor, stalled: stalled.has(row.id) }),
    );
  }

  async run(id: number, now: number): Promise<RunRow | null> {
    const [row] = await this.all<Omit<RunRow, "stalled" | "editor">>(
      `${await this.runSelect()} WHERE r.id = ?`,
      [id],
    );
    if (!row) return null;
    const stalled = row.ended_at == null ? (await this.stalledRuns(now)).has(row.id) : false;
    return { ...row, editor: describeTask(row.path).editor, stalled };
  }

  /** Every try of a run's tick, first first. */
  async attempts(run: Pick<RunRow, "id" | "retry_of">): Promise<{ id: number; status: string }[]> {
    if (!(await this.columns()).retryOf) return [{ id: run.id, status: "" }];
    const first = run.retry_of ?? run.id;
    return this.all("SELECT id, status FROM task_runs WHERE id = ? OR retry_of = ? ORDER BY id", [
      first,
      first,
    ]);
  }

  async result(runId: number): Promise<string | null> {
    if (!(await this.columns()).result) return null;
    const [row] = await this.all<{ result: string | null }>(
      "SELECT result FROM task_runs WHERE id = ?",
      [runId],
    );
    return row?.result ?? null;
  }

  /** Log lines oldest first: the newest `limit` of them. */
  async logs(filter: {
    runId?: number;
    taskId?: number;
    levels?: readonly string[];
    lifecycle?: boolean;
    limit?: number;
  }): Promise<LogRow[]> {
    const where: string[] = [];
    const args: Value[] = [];
    if (filter.runId !== undefined) {
      where.push("l.task_run_id = ?");
      args.push(filter.runId);
    }
    if (filter.taskId !== undefined) {
      where.push("l.file_task_id = ?");
      args.push(filter.taskId);
    }
    if (filter.levels) {
      where.push(`l.status IN (${filter.levels.map(() => "?").join(", ")})`);
      args.push(...filter.levels);
    }
    if (!filter.lifecycle) where.push(taskLine("l.value"));
    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 50_000);
    const rows = await this.all<LogRow>(
      `SELECT l.id, l.task_run_id AS run_id, l.file_task_id AS task_id, t.path, l.status, l.value,
              l.created_at
       FROM logs l JOIN file_tasks t ON t.id = l.file_task_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY l.id DESC LIMIT ${limit}`,
      args,
    );
    return rows.toReversed();
  }

  async timings(runId: number): Promise<TimingRow[]> {
    return this.all(
      "SELECT label, value, created_at FROM timings WHERE task_run_id = ? ORDER BY created_at - value, id",
      [runId],
    );
  }
}
