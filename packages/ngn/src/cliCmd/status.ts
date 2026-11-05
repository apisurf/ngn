/**
 * `ngn status` — the Overview in the terminal: is anything wrong, then one row
 * per task. The verdict is the same sentence ngnui leads with.
 *
 * Exits 0 when everything is healthy and 2 when the verdict names a problem,
 * so a script can check health without parsing; 1 is for not being able to
 * read at all.
 */
import { cronOf, describeCron, formatAgo, formatMs, verdict } from "@apisurf/ngn-schema/describe";
import { RunStore } from "../read/store.js";
import { healthOf } from "../read/words.js";
import { renderJson, renderTable } from "../util/format.js";
import { resolveDbPath } from "../util/resolveDb.js";

export interface StatusOptions {
  db?: string;
  root?: string;
  json?: boolean;
}

export const UNHEALTHY_EXIT = 2;

export const status = async (options: StatusOptions) => {
  const dbPath = await resolveDbPath(options, { mustExist: true });
  if (dbPath === null) {
    process.exitCode = 1;
    return;
  }
  const store = RunStore.open(dbPath);
  try {
    const now = Date.now();
    const tasks = (await store.tasks()).filter((task) => !task.editor);
    const projectIds = new Set(tasks.map((task) => task.id));
    const stalled = [...(await store.stalledRuns(now)).values()].filter((run) =>
      projectIds.has(run.task_id),
    );
    const stalledRunIds = new Set(stalled.map((run) => run.run_id));
    const stale = (await store.locks()).filter(
      (lock) => lock.expires_at <= now && (lock.run_id == null || !stalledRunIds.has(lock.run_id)),
    );
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const result = verdict(
      {
        tasks: tasks.length,
        failing: tasks.filter((task) => task.last_outcome === "failure").length,
        stalled: stalled.map((run) => ({ ...run, file: byId.get(run.task_id)!.file })),
        stale: stale.length,
      },
      now,
    );

    const stalledTasks = new Set(stalled.map((run) => run.task_id));
    const rows = await Promise.all(
      tasks.map(async (task) => {
        const cron = cronOf(await store.latestCode(task.id));
        return {
          task: task.path,
          schedule: cron ? (describeCron(cron) ?? cron) : null,
          cron,
          health: healthOf(task, stalledTasks),
          last_ran: task.last_run_at,
          last_run_id: task.last_run_id,
          avg_ms: task.avg_ms,
          runs: task.run_count,
        };
      }),
    );

    if (options.json) {
      process.stdout.write(
        `${renderJson({ verdict: result, tasks: rows, stalled: stalled.map((run) => run.run_id) })}\n`,
      );
    } else {
      process.stdout.write(`${result.tone === "ok" ? "✓" : "✗"} ${result.text}\n`);
      if (rows.length) {
        const table = rows.map((row) => ({
          task: row.task,
          schedule: row.schedule,
          health: row.health,
          "last ran": row.last_ran == null ? "never" : formatAgo(now, row.last_ran),
          avg: formatMs(row.avg_ms),
          runs: row.runs,
        }));
        process.stdout.write(`\n${renderTable(table, Object.keys(table[0]!))}\n`);
      }
    }
    if (result.tone !== "ok") process.exitCode = UNHEALTHY_EXIT;
  } finally {
    store.close();
  }
};
