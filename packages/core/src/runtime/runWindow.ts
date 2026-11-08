/**
 * When a run should stop taking on work.
 *
 * A scheduled run gets until shortly before the next tick: the margin is a
 * tenth of the period, at most five seconds, so a task that stops at its
 * deadline has time to finish what is in flight before the next run starts.
 * `budgetMs` caps that further. A run with no next tick gets its budget, or
 * `periodMs` from its start when it has a period but no budget (the trailing
 * edge, whose next run depends on when this one ends). A run with none of these
 * (`--once`, the Editor) has no deadline.
 */
export function runDeadline({
  startedAt,
  scheduledAt,
  nextAt,
  budgetMs,
  periodMs = null,
}: {
  startedAt: number;
  scheduledAt: number | null;
  nextAt: number | null;
  budgetMs: number | null;
  periodMs?: number | null;
}): number | null {
  const candidates: number[] = [];

  if (nextAt != null) {
    const period = nextAt - (scheduledAt ?? startedAt);
    candidates.push(nextAt - Math.min(5_000, Math.max(0, period) * 0.1));
  }
  if (budgetMs != null) candidates.push(startedAt + budgetMs);
  else if (nextAt == null && periodMs != null) candidates.push(startedAt + periodMs);

  // Whole milliseconds, like every other time ngn stores.
  return candidates.length ? Math.floor(Math.min(...candidates)) : null;
}

/**
 * An AbortSignal that fires at `deadline`, or when `outer` does (ngn stopping,
 * the task's lease lost), and the function that disarms it. A deadline already
 * past aborts straight away; no deadline never aborts.
 */
export function deadlineSignal(deadline: number | null, outer?: AbortSignal) {
  const controller = new AbortController();
  const onOuter = () => controller.abort(outer?.reason);
  if (outer?.aborted) onOuter();
  else outer?.addEventListener("abort", onOuter, { once: true });
  const detach = () => outer?.removeEventListener("abort", onOuter);
  if (deadline == null) return { signal: controller.signal, dispose: detach };

  const abort = () => controller.abort(new Error("The run reached its deadline"));
  const delay = deadline - Date.now();
  if (delay <= 0) {
    abort();
    return { signal: controller.signal, dispose: detach };
  }

  // A timer longer than ~24.8 days overflows and Node fires it after 1 ms, so a
  // monthly task's deadline is waited for in steps no longer than that.
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const left = deadline - Date.now();
    if (left <= 0) return abort();
    timer = setTimeout(arm, Math.min(left, MAX_TIMER_MS));
    // A pending deadline must not keep `ngn run:once` alive after the run ends.
    timer.unref();
  };
  arm();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      detach();
    },
  };
}

/** The longest delay setTimeout takes as given. */
const MAX_TIMER_MS = 2 ** 31 - 1;
