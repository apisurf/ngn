// What the UI knows about ngn. Everything that turns a row into words — status
// labels, skip reasons, log levels, task paths, schedules, what a task's
// compiled code says — is shared with the ngn CLI and lives in
// @apisurf/ngn-schema/describe, so the terminal and the dashboard say the same
// thing. What is left here is how the UI colours those answers.

import type { LogLevel } from "@apisurf/ngn-schema/describe";

export * from "@apisurf/ngn-schema/describe";

export type Tone = "ok" | "info" | "warn" | "bad" | "neutral";

const RUN_TONE: Record<string, Tone> = {
  success: "ok",
  failure: "bad",
  running: "info",
  pending: "neutral",
  skipped: "neutral",
};

/** A run's colour. A Stalled run is a warning: nothing failed, but nothing will finish. */
export function runTone(status: string | null | undefined, stalled = false): Tone {
  if (stalled) return "warn";
  return (status && RUN_TONE[status]) || "neutral";
}

/**
 * The dot beside a run in a list. A success is the normal case, so it gets a
 * quiet grey dot like a skip; colour is kept for the runs that need a look.
 */
export function runMark(status: string | null | undefined, stalled = false): Tone {
  const tone = runTone(status, stalled);
  return tone === "ok" ? "neutral" : tone;
}

export const LEVEL_TONE: Record<LogLevel, Tone> = { info: "info", warn: "warn", error: "bad" };

/** A stable colour slot for a timing label, so `fetch` looks the same everywhere. */
export function seriesSlot(label: string, slots = 8): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return Math.abs(hash) % slots;
}
