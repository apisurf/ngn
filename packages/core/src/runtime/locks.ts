import { LockService } from "../db/services/lock.js";
import { toMs, type Duration } from "./duration.js";

export interface LockOptions {
  /**
   * How long the lease lasts if this process stops renewing it (it dies, or
   * the event loop is stuck). Renewed while held. Default one minute.
   */
  ttl?: Duration;
  /**
   * How long to wait for a lock someone else holds: `true` (default) waits
   * until the run's deadline, or for as long as it takes when there is none;
   * `false` gives up at once; a duration waits that long.
   */
  wait?: boolean | Duration;
}

/**
 * Thrown by `ctx.lock` when the lock could not be had in time. Tasks can tell
 * it apart by `name`, which survives a second copy of ngn in node_modules where
 * `instanceof` would not.
 */
export class LockBusyError extends Error {
  override name = "LockBusyError";

  constructor(readonly lockName: string) {
    super(`Lock "${lockName}" is held by another run`);
  }
}

const DEFAULT_TTL_MS = 60_000;
const MAX_POLL_MS = 1_000;

interface Held {
  release(): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertLockName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`A lock name must be a non-empty string, got ${JSON.stringify(name)}`);
  }
}

/** The locks one run takes, all recorded against its `task_runs` row. */
export function createRunLocks(service: LockService, taskRunId: number) {
  /** Take `name` once, renewing it in the background until released. */
  async function tryHold(name: string, ttlMs: number): Promise<Held | null> {
    const holder = await service.tryAcquire(name, ttlMs, taskRunId);
    if (!holder) return null;

    const renewal = setInterval(() => {
      service.renew(name, holder, ttlMs).catch(() => {
        // A missed renewal is retried on the next interval; the lease only
        // lapses if every renewal in a whole ttl fails.
      });
    }, ttlMs / 3);
    renewal.unref();

    return {
      async release() {
        clearInterval(renewal);
        await service.release(name, holder);
      },
    };
  }

  /** Poll for `name` until `waitUntil`, backing off up to a second between tries. */
  async function hold(name: string, ttlMs: number, waitUntil: number): Promise<Held | null> {
    for (let pause = 25; ; pause = Math.min(pause * 2, MAX_POLL_MS)) {
      const held = await tryHold(name, ttlMs);
      if (held) return held;

      const left = waitUntil - Date.now();
      if (left <= 0) return null;
      await sleep(Math.min(pause, left));
    }
  }

  return {
    /** `ctx.lock`: run `fn` holding `name`, released however `fn` ends. */
    async lock<T>(
      name: string,
      fn: () => Promise<T> | T,
      options: LockOptions,
      deadline: number | null,
    ): Promise<T> {
      assertLockName(name);
      const ttlMs = options.ttl == null ? DEFAULT_TTL_MS : toMs(options.ttl, "lock ttl");
      const { wait = true } = options;
      const waitUntil =
        wait === true
          ? (deadline ?? Number.POSITIVE_INFINITY)
          : wait === false
            ? Date.now()
            : Date.now() + toMs(wait, "lock wait");

      const held = await hold(name, ttlMs, waitUntil);
      if (!held) throw new LockBusyError(name);

      try {
        return await fn();
      } finally {
        await held.release();
      }
    },

    /**
     * Take every lock in `names` without waiting, for `exclusive`. Names are
     * taken in sorted order so two runs asking for overlapping sets cannot
     * each hold half. If any is busy, the ones already taken are given back.
     */
    async holdAll(names: readonly string[]): Promise<{ busy: string } | Held> {
      const taken: Held[] = [];
      const releaseAll = async () => {
        await Promise.all(taken.map((held) => held.release()));
      };

      for (const name of [...new Set(names)].toSorted()) {
        const held = await tryHold(name, DEFAULT_TTL_MS);
        if (!held) {
          await releaseAll();
          return { busy: name };
        }
        taken.push(held);
      }

      return { release: releaseAll };
    },
  };
}

export type RunLocks = ReturnType<typeof createRunLocks>;

/** The `exclusive` export as a list of names; throws on anything else. */
export function exclusiveNames(value: unknown, taskPath: string): string[] {
  if (value == null) return [];
  const names = Array.isArray(value) ? value : [value];
  for (const name of names) {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error(
        `Invalid exclusive for ${taskPath}: expected a lock name or a list of them, got ${JSON.stringify(value)}`,
      );
    }
  }
  return names as string[];
}
