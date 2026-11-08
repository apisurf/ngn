/**
 * What time it is, and how to wait: the one seam the scheduler takes time
 * through, so a test can drive grids, sleeps and restarts without patching
 * global timers (which task code, in its own VM context, never sees anyway).
 */
export interface Clock {
  now(): number;
  /** Resolve after `ms`, or as soon as `signal` aborts. Never rejects. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep(ms, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      signal?.addEventListener("abort", done, { once: true });
    });
  },
};

/**
 * How long one wait lasts before the clock is read again. A timer does not
 * count time the machine spends asleep, so a long wait made in one piece
 * could fire hours late; in steps this short, a run that fell due during a
 * sleep starts within a second or two of waking.
 */
export const WAIT_STEP_MS = 1_000;

/**
 * Wait until `at` on `clock`, in steps of `WAIT_STEP_MS`. Resolves early, with
 * false, when `signal` aborts or `stop()` says to; true once `at` has come.
 */
export async function waitUntil(
  clock: Clock,
  at: number,
  { signal, stop }: { signal?: AbortSignal; stop?: () => boolean } = {},
): Promise<boolean> {
  for (;;) {
    if (signal?.aborted || stop?.()) return false;
    const left = at - clock.now();
    if (left <= 0) return true;
    await clock.sleep(Math.min(left, WAIT_STEP_MS), signal);
  }
}
