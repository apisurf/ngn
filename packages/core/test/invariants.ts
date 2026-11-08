import { expect } from "vitest";
import { foldSchedule, invalidStep } from "@apisurf/ngn-schema/describe";
import type { EventRow, Harness } from "./helpers.js";

/**
 * What must hold of any database the scheduler wrote, whatever happened:
 *
 * - each task's events are a path through the state table
 * - each schedule row is the fold of its events
 * - no two run rows of a task overlap in time, unless its log shows a lost lease
 * - after a graceful stop (`stopped`), no run row of a scheduled task is left open
 */
export async function expectScheduleInvariants(h: Harness, { stopped = false } = {}) {
  const tasks = await h.query<{ id: number; path: string }>(
    "SELECT t.id, t.path FROM file_tasks t JOIN schedules s ON s.file_task_id = t.id",
  );
  for (const task of tasks) {
    const events = await h.query<EventRow>(
      "SELECT * FROM schedule_events WHERE file_task_id = ? ORDER BY id",
      [task.id],
    );
    const [row] = await h.query<Record<string, unknown>>(
      "SELECT state, next_at, reason, source, holder, anchor, request FROM schedules WHERE file_task_id = ?",
      [task.id],
    );
    expect(invalidStep(events), `${task.path}: an event off the state table`).toBeNull();
    expect(foldSchedule(events), `${task.path}: the row is not the fold of its log`).toEqual({
      ...row,
    });

    const runs = await h.query<{ id: number; started_at: number; ended_at: number | null }>(
      `SELECT id, started_at, ended_at FROM task_runs
       WHERE file_task_id = ? AND started_at IS NOT NULL ORDER BY started_at, id`,
      [task.id],
    );
    if (!events.some((e) => e.event === "lease_lost")) {
      for (let i = 1; i < runs.length; i++) {
        const before = runs[i - 1]!;
        const run = runs[i]!;
        expect(
          before.ended_at != null && before.ended_at <= run.started_at,
          `${task.path}: run #${run.id} started while #${before.id} was going`,
        ).toBe(true);
      }
    }

    if (stopped) {
      const open = await h.query<{ id: number }>(
        "SELECT id FROM task_runs WHERE file_task_id = ? AND ended_at IS NULL",
        [task.id],
      );
      expect(open, `${task.path}: runs left open after a graceful stop`).toEqual([]);
    }
  }
}
