/**
 * `ngn logs <task|run>` — the lines a task wrote, oldest first: one run's, or
 * a task's across its runs. A task is named the way `ngn run` takes one.
 */
import { formatDateTime, formatMs, logLevel } from "@apisurf/ngn-schema/describe";
import { RunStore } from "../read/store.js";
import { describeAmbiguous, describeNoMatch, matchTasks } from "../util/matchTasks.js";
import { renderJson } from "../util/format.js";
import { resolveDbPath } from "../util/resolveDb.js";
import { levelWord } from "./show.js";

export interface LogsOptions {
  db?: string;
  root?: string;
  json?: boolean;
  level?: string;
  limit?: string;
  lifecycle?: boolean;
}

/** The stored levels at `level` or above. `warning` is what ctx.log.warning() writes. */
const AT_LEAST: Record<string, string[] | null> = {
  info: null,
  warn: ["warn", "warning", "error"],
  warning: ["warn", "warning", "error"],
  error: ["error"],
};

export const logs = async (target: string, options: LogsOptions) => {
  const level = (options.level ?? "info").toLowerCase();
  if (!(level in AT_LEAST)) {
    process.stderr.write(`ngn: --level expects info, warn or error (got "${options.level}")\n`);
    process.exitCode = 1;
    return;
  }
  const limit = options.limit === undefined ? 200 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    process.stderr.write(`ngn: --limit expects a positive number (got "${options.limit}")\n`);
    process.exitCode = 1;
    return;
  }
  const dbPath = await resolveDbPath(options, { mustExist: true });
  if (dbPath === null) {
    process.exitCode = 1;
    return;
  }

  const store = RunStore.open(dbPath);
  try {
    const now = Date.now();
    const scope = await scopeOf(store, target, now);
    if (!scope) {
      process.exitCode = 1;
      return;
    }
    const rows = await store.logs({
      ...scope.filter,
      levels: AT_LEAST[level] ?? undefined,
      lifecycle: options.lifecycle,
      limit,
    });
    if (options.json) {
      process.stdout.write(
        `${renderJson(
          rows.map((row) => ({
            run: row.run_id,
            task: row.path,
            at: row.created_at,
            level: logLevel(row.status),
            message: row.value,
          })),
        )}\n`,
      );
      return;
    }
    if (rows.length === 0) {
      process.stderr.write(`no log lines for ${scope.label}\n`);
      return;
    }
    for (const row of rows) {
      const when =
        scope.start == null
          ? `${formatDateTime(now, row.created_at)}  #${row.run_id}`
          : `+${formatMs(Math.max(0, row.created_at - scope.start))}`.padEnd(10);
      process.stdout.write(`${when}  ${levelWord(row.status)} ${row.value}\n`);
    }
    if (rows.length === limit)
      process.stderr.write(`\nthe newest ${limit} lines; --limit for more\n`);
  } finally {
    store.close();
  }
};

/** A run id, or a task name; null after saying why it is neither. */
async function scopeOf(
  store: RunStore,
  target: string,
  now: number,
): Promise<{
  filter: { runId?: number; taskId?: number };
  label: string;
  start: number | null;
} | null> {
  if (/^#?\d+$/.test(target)) {
    const id = Number(target.replace(/^#/, ""));
    const run = await store.run(id, now);
    if (!run) {
      process.stderr.write(`ngn: there is no run ${id}\n`);
      return null;
    }
    return { filter: { runId: id }, label: `run ${id}`, start: run.started_at ?? run.created_at };
  }
  const tasks = await store.tasks();
  const match = matchTasks(
    tasks.map((task) => task.path),
    target,
  );
  if (match.paths.length !== 1) {
    process.stderr.write(
      `${match.paths.length ? describeAmbiguous(match) : describeNoMatch(match)}\n`,
    );
    return null;
  }
  const task = tasks.find((t) => t.path === match.paths[0])!;
  return { filter: { taskId: task.id }, label: task.path, start: null };
}
