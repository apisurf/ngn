import type { Duration } from "../duration.js";
import type { Job, Queue } from "./queue.js";

export interface WorkerHandle<W> {
  /** Which worker this is, from 0. */
  index: number;
  /** What `worker.setup` returned for this worker, e.g. a browser tab. */
  resource: W;
  /** The `until` signal: aborts when the run should stop taking on work. */
  signal: AbortSignal;
  /**
   * Hand this job back unworked instead of completing it, by default without
   * spending its attempt.
   */
  release(options?: { delay?: Duration; refund?: boolean }): void;
  /**
   * Stop this job's group for the rest of the call: this job and any of the
   * group's jobs already claimed are handed back, and no more are claimed.
   * For a site that answered with a bot wall, where every other page would
   * get the same answer.
   */
  stopGroup(options?: { delay?: Duration; refund?: boolean }): void;
}

export interface WorkOptions<W> {
  /** Jobs worked at once. Default 1. */
  concurrency?: number;
  /** Most jobs this call takes. Default no limit. */
  max?: number;
  /**
   * Most jobs one group contributes to this call, or a function giving each
   * group its own cap (one site is slower, or touchier, than another). A cap of
   * 0 leaves the group alone. Default no limit.
   */
  perGroup?: number | ((group: string) => number);
  /**
   * When to stop taking on work: a signal, or an epoch-ms time. Jobs already
   * started are finished. Default `ctx.run.signal`.
   */
  until?: AbortSignal | number;
  /** Per-worker resources, made when a worker takes its first job. */
  worker?: {
    setup?: (index: number) => Promise<W> | W;
    teardown?: (resource: W, index: number) => Promise<void> | void;
  };
}

export type WorkHandler<T, W> = (
  job: Job<T>,
  worker: WorkerHandle<W>,
) => Promise<unknown> | unknown;

export interface WorkSummary {
  done: number;
  /** Attempts that failed, the ones that left their job dead included. */
  failed: number;
  /** Of those, how many jobs had no attempts left. */
  dead: number;
  /** Claimed and handed back unworked. */
  released: number;
  /** Jobs due that this call left for the next one. */
  remaining: number;
  /** How long the oldest ready job has waited, or null when there is none. */
  oldestAgeMs: number | null;
  /** Groups stopped with `stopGroup`. */
  stoppedGroups: string[];
  /** Why the call ended. */
  stoppedBy: "empty" | "deadline" | "max";
}

type Settle = { kind: "release" | "stopGroup"; delay?: Duration; refund?: boolean };

function untilSignal(until: AbortSignal | number | undefined): AbortSignal {
  if (until === undefined) return new AbortController().signal;
  if (typeof until !== "number") return until;
  const left = until - Date.now();
  // AbortSignal.timeout(0) only aborts on a later tick; a time already past should stop at once.
  return left <= 0 ? AbortSignal.abort() : AbortSignal.timeout(left);
}

/**
 * One `queue.work()` call: a pool of workers fed by small claims.
 *
 * Claims are made a few jobs at a time rather than all up front, and skip
 * every group that already has a job in hand. That is what keeps a group to
 * one job at a time across the whole pool, and it means stopping at the
 * deadline leaves the rest of the queue unclaimed rather than leased to a run
 * that will never get to it.
 */
class WorkRun<T, W> {
  private readonly buffer: Job<T>[] = [];
  /** Groups with a job buffered or being worked. */
  private readonly busyGroups = new Set<string>();
  private readonly stopped = new Set<string>();
  private readonly perGroupCount = new Map<string, number>();
  private readonly capped = new Set<string>();
  /**
   * Every job this call has claimed. Never claimed twice: without a next tick
   * to back off to (run:once), a failed or released job is due again at once,
   * and the call would spend all its attempts in one go.
   */
  private readonly seen = new Set<number>();
  private readonly signal: AbortSignal;
  private readonly concurrency: number;
  private readonly max: number;
  private claiming: Promise<number> | null = null;
  private claimed = 0;
  private working = 0;
  /** Workers waiting for a job in hand to finish and free its group. */
  private waiting: Array<() => void> = [];
  private stoppedBy: WorkSummary["stoppedBy"] = "empty";
  /** Set when a worker breaks: the others finish what they hold and stop. */
  private broken = false;
  private readonly tally = { done: 0, failed: 0, dead: 0, released: 0 };

  constructor(
    private readonly queue: Queue<T>,
    private readonly handler: WorkHandler<T, W>,
    private readonly options: WorkOptions<W>,
  ) {
    this.signal = untilSignal(options.until);
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
    this.max = options.max ?? Number.POSITIVE_INFINITY;
  }

  async run(): Promise<WorkSummary> {
    const workers = Array.from({ length: this.concurrency }, (_, index) => this.worker(index));
    try {
      const results = await Promise.allSettled(workers);
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw (failure as PromiseRejectedResult).reason;
    } finally {
      // Claimed, never started: back to the queue as if never claimed.
      await this.releaseJobs(this.buffer.splice(0), { kind: "release" });
    }

    const stats = await this.queue.stats();
    return {
      ...this.tally,
      remaining: stats.due,
      oldestAgeMs: stats.oldestReadyAgeMs,
      stoppedGroups: [...this.stopped],
      stoppedBy: this.stoppedBy,
    };
  }

  private shouldStop() {
    if (this.broken) return true;
    if (this.signal.aborted) this.stoppedBy = "deadline";
    return this.signal.aborted;
  }

  /**
   * The next job for a worker: one from the buffer, refilled when empty.
   * `"empty"` when nothing is claimable and no job in hand could change that;
   * null to ask again (after a refill, a wait, or a job put back).
   */
  private async nextJob(): Promise<Job<T> | "empty" | null> {
    const job = this.buffer.shift();
    if (job && this.atCap(job.group)) {
      // Only a cap of 0 gets here: any other is caught before claiming.
      this.capped.add(job.group!);
      await this.releaseJobs([job], { kind: "release" });
      return null;
    }
    if (job) return job;

    if (await this.refill()) return null;
    // Nothing claimable now. If no job is being worked, nothing will free a
    // group up either, so the queue is done for this call.
    if (this.working === 0) return "empty";
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    return null;
  }

  private async worker(index: number) {
    let resource: { value: W } | null = null;
    try {
      for (;;) {
        if (this.shouldStop()) return;
        const job = await this.nextJob();
        if (job === "empty") return;
        if (!job) continue;

        try {
          resource ??= { value: (await this.options.worker?.setup?.(index)) as W };
        } catch (error) {
          // Not started, so it goes back with the rest of the buffer.
          this.buffer.unshift(job);
          throw error;
        }
        await this.work(job, index, resource.value);
      }
    } catch (error) {
      this.broken = true;
      throw error;
    } finally {
      if (resource) await this.options.worker?.teardown?.(resource.value, index);
    }
  }

  /** Claim up to one job per free worker. Shared by workers that ask at once. */
  private refill(): Promise<number> {
    this.claiming ??= this.claim().finally(() => (this.claiming = null));
    return this.claiming;
  }

  private async claim(): Promise<number> {
    const room = Math.min(this.concurrency, this.max - this.claimed);
    if (room <= 0) {
      this.stoppedBy = "max";
      return 0;
    }

    const jobs = await this.queue.claim({
      limit: room,
      perGroup: 1,
      skipGroups: [...this.busyGroups, ...this.stopped, ...this.capped],
      skipIds: [...this.seen],
    });
    this.claimed += jobs.length;
    for (const job of jobs) {
      this.seen.add(job.id);
      if (job.group != null) this.busyGroups.add(job.group);
      this.buffer.push(job);
    }
    if (this.claimed >= this.max) this.stoppedBy = "max";
    return jobs.length;
  }

  private async work(job: Job<T>, index: number, resource: W) {
    this.working++;
    this.countForGroup(job.group);
    let settle: Settle | null = null;

    const handle: WorkerHandle<W> = {
      index,
      resource,
      signal: this.signal,
      release: (options = {}) => {
        settle ??= { kind: "release", ...options };
      },
      stopGroup: (options = {}) => {
        settle ??= { kind: "stopGroup", ...options };
      },
    };

    try {
      try {
        await this.handler(job, handle);
        // Read through the handle's closures, which TypeScript cannot follow.
        const asked = settle as Settle | null;
        if (asked) await this.settleAsked(job, asked);
        else if (await this.queue.complete(job)) this.tally.done++;
      } catch (error) {
        await this.failJob(job, error);
      }
    } finally {
      if (job.group != null) this.busyGroups.delete(job.group);
      this.working--;
      for (const resolve of this.waiting.splice(0)) resolve();
    }
  }

  private async failJob(job: Job<T>, error: unknown) {
    if (!(await this.queue.fail(job, error))) return;
    this.tally.failed++;
    if (job.attempts >= job.maxAttempts) this.tally.dead++;
  }

  private async settleAsked(job: Job<T>, settle: Settle) {
    if (settle.kind === "stopGroup" && job.group != null) {
      this.stopped.add(job.group);
      const rest = this.buffer.filter((other) => other.group === job.group);
      const keep = this.buffer.filter((other) => other.group !== job.group);
      this.buffer.splice(0, this.buffer.length, ...keep);
      await this.releaseJobs(rest, settle);
    }
    await this.releaseJobs([job], settle);
  }

  private async releaseJobs(jobs: Job<T>[], { delay, refund }: Settle) {
    for (const job of jobs) {
      if (await this.queue.release(job, { delay, refund })) this.tally.released++;
      if (job.group != null) this.busyGroups.delete(job.group);
    }
  }

  private groupLimit(group: string) {
    const { perGroup } = this.options;
    if (perGroup == null) return Number.POSITIVE_INFINITY;
    return typeof perGroup === "function" ? perGroup(group) : perGroup;
  }

  private atCap(group: string | null) {
    return group != null && (this.perGroupCount.get(group) ?? 0) >= this.groupLimit(group);
  }

  private countForGroup(group: string | null) {
    if (group == null) return;
    const count = (this.perGroupCount.get(group) ?? 0) + 1;
    this.perGroupCount.set(group, count);
    if (count >= this.groupLimit(group)) this.capped.add(group);
  }
}

export function work<T, W>(
  queue: Queue<T>,
  handler: WorkHandler<T, W>,
  options: WorkOptions<W>,
): Promise<WorkSummary> {
  return new WorkRun(queue, handler, options).run();
}
