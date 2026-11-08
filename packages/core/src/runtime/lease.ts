import { LockService } from "../db/services/lock.js";
import { RESERVED_LOCK_PREFIX } from "./locks.js";

/** How long a task's lease lasts without renewal: how long a dead process holds a task. */
export const TASK_LEASE_TTL_MS = 60_000;

/** The reserved lock name a task's lease lives under. */
export function taskLeaseName(taskPath: string): string {
  return `${RESERVED_LOCK_PREFIX}task:${taskPath}`;
}

/** Who holds a task's lease when it could not be had. */
export interface LeaseHolder {
  holder: string;
  runId: number | null;
}

/**
 * One process's hold on a task: whatever runs of it this process starts, no
 * other process starts one. Renewed in the background while held; `signal`
 * aborts if it is lost, because a renewal found someone else holding it or
 * none got through within its lifetime.
 */
export class TaskLease {
  private readonly controller = new AbortController();
  private renewal: ReturnType<typeof setInterval> | null = null;
  private lastRenewed = Date.now();
  private released = false;

  private constructor(
    private readonly locks: LockService,
    readonly name: string,
    readonly holder: string,
    private readonly ttlMs: number,
    private readonly onLost: (lease: TaskLease) => void,
  ) {
    this.renewal = setInterval(() => void this.renew(), Math.max(10, ttlMs / 3));
    this.renewal.unref();
  }

  /** Take the task's lease, or say who has it. */
  static async take(
    locks: LockService,
    taskPath: string,
    {
      ttlMs = TASK_LEASE_TTL_MS,
      onLost = () => {},
    }: { ttlMs?: number; onLost?: (lease: TaskLease) => void } = {},
  ): Promise<TaskLease | { busy: LeaseHolder }> {
    const name = taskLeaseName(taskPath);
    const holder = await locks.tryAcquire(name, ttlMs, null);
    if (holder) return new TaskLease(locks, name, holder, ttlMs, onLost);
    const held = await locks.holderOf(name);
    return { busy: { holder: held?.holder ?? "", runId: held?.taskRunId ?? null } };
  }

  /** Aborts when the lease is lost. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get lost(): boolean {
    return this.controller.signal.aborted;
  }

  /** Record the run the lease is working for, so a refusal can name it. */
  async setRun(runId: number) {
    if (this.released || this.lost) return;
    await this.locks.setRun(this.name, this.holder, runId).catch(() => {});
  }

  private async renew() {
    if (this.released || this.lost) return;
    // A renewal that comes too late is a lease already lost, whatever the row
    // says now: another process could have taken it in between.
    if (Date.now() - this.lastRenewed > this.ttlMs) return this.lose();
    try {
      if (await this.locks.renew(this.name, this.holder, this.ttlMs)) {
        this.lastRenewed = Date.now();
      } else {
        this.lose();
      }
    } catch {
      // Tried again on the next interval, until the lease runs out.
    }
  }

  private lose() {
    if (this.lost) return;
    this.stopRenewing();
    this.controller.abort(new Error("the run lost its lease"));
    this.onLost(this);
  }

  private stopRenewing() {
    if (this.renewal) clearInterval(this.renewal);
    this.renewal = null;
  }

  async release() {
    if (this.released) return;
    this.released = true;
    this.stopRenewing();
    await this.locks.release(this.name, this.holder).catch(() => {});
  }

  /** Stop renewing without giving the lease back, as a process that died would. */
  abandon() {
    this.released = true;
    this.stopRenewing();
  }
}
