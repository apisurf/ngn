// Which of a run's tabs has anything in it, and which one to open on.
//
// A run opens on its most useful content rather than on a fixed tab: a failed
// run on what it logged, a run that logged or timed something on its timeline,
// and a quiet one on what it returned, or its details when it returned nothing.

export type RunTab = "timeline" | "logs" | "timings" | "result" | "details";

export const RUN_TABS: readonly RunTab[] = ["timeline", "logs", "timings", "result", "details"];

export interface RunContent {
  /** Did the run fail? */
  failed: boolean;
  /** Log lines the task wrote itself, ngn's lifecycle lines left out. */
  taskLines: number;
  timings: number;
  hasResult: boolean;
}

/** Whether a tab would show something for this run. Details always has the run's own fields. */
export function hasContent(tab: RunTab, content: RunContent): boolean {
  switch (tab) {
    case "timeline":
      return content.taskLines + content.timings > 0;
    case "logs":
      return content.taskLines > 0;
    case "timings":
      return content.timings > 0;
    case "result":
      return content.hasResult;
    case "details":
      return true;
  }
}

/**
 * The tabs a run shows: the ones with something in them. Logs and Details are
 * always there; Logs also holds ngn's own lifecycle lines.
 */
export function visibleRunTabs(content: RunContent): RunTab[] {
  return RUN_TABS.filter((tab) => tab === "logs" || tab === "details" || hasContent(tab, content));
}

export function defaultRunTab(content: RunContent): RunTab {
  if (content.failed && content.taskLines > 0) return "logs";
  if (hasContent("timeline", content)) return "timeline";
  if (content.hasResult) return "result";
  return "details";
}

/**
 * The tab to show: the one asked for by name when this run shows it, else the
 * one carried over from the previous run when this run has something there,
 * else this run's default.
 */
export function pickRunTab(
  content: RunContent,
  asked: RunTab | undefined,
  carried: RunTab | undefined,
): RunTab {
  if (asked && visibleRunTabs(content).includes(asked)) return asked;
  if (carried && hasContent(carried, content)) return carried;
  return defaultRunTab(content);
}
