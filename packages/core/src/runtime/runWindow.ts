/**
 * When a run should stop taking on work.
 *
 * A scheduled run gets until shortly before the next tick: the margin is a
 * tenth of the period, at most five seconds, so a task that stops at its
 * deadline has time to finish what is in flight before the next run starts.
 * `budgetMs` caps that further. A run with no next tick and no budget (run:once,
 * the live editor) has no deadline.
 */
export function runDeadline({
  startedAt,
  scheduledAt,
  nextAt,
  budgetMs,
}: {
  startedAt: number;
  scheduledAt: number | null;
  nextAt: number | null;
  budgetMs: number | null;
}): number | null {
  const candidates: number[] = [];

  if (nextAt != null) {
    const period = nextAt - (scheduledAt ?? startedAt);
    candidates.push(nextAt - Math.min(5_000, Math.max(0, period) * 0.1));
  }
  if (budgetMs != null) candidates.push(startedAt + budgetMs);

  // Whole milliseconds, like every other time ngn stores.
  return candidates.length ? Math.floor(Math.min(...candidates)) : null;
}

/**
 * An AbortSignal that fires at `deadline`, and the function that disarms it.
 * A deadline already past aborts straight away; no deadline never aborts.
 */
export function deadlineSignal(deadline: number | null) {
  const controller = new AbortController();
  if (deadline == null) return { signal: controller.signal, dispose: () => {} };

  const abort = () => controller.abort(new Error("The run reached its deadline"));
  const delay = deadline - Date.now();
  if (delay <= 0) {
    abort();
    return { signal: controller.signal, dispose: () => {} };
  }

  const timer = setTimeout(abort, delay);
  // A pending deadline must not keep `ngn run:once` alive after the run ends.
  timer.unref();
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}
