/**
 * `ngn runs` — run history, filtered with the words the Runs page uses.
 *
 *   ngn runs --task extract --status failed --since 24h
 *   ngn runs "task:extract status:failed since:24h"
 *
 * Both forms are the same filter language (see the describe module's query),
 * so a filter copied out of ngnui's Runs page works here as it stands.
 */
import { formatDateTime, formatMs, parseRunQuery, plural } from "@apisurf/ngn-schema/describe";
import { RunStore } from "../read/store.js";
import { runCell, runJson, taskName } from "../read/words.js";
import { renderJson, renderTable } from "../util/format.js";
import { resolveDbPath } from "../util/resolveDb.js";

export interface RunsOptions {
  db?: string;
  root?: string;
  json?: boolean;
  task?: string;
  status?: string;
  origin?: string;
  since?: string;
  until?: string;
  limit?: string;
}

/** Each flag as the token it stands for; a comma lists alternatives (`--status failed,stalled`). */
export function flagsAsQuery(options: RunsOptions): string {
  const keys = ["task", "status", "origin", "since", "until"] as const;
  return keys
    .flatMap((key) =>
      (options[key] ?? "")
        .split(",")
        .filter(Boolean)
        .map((value) => `${key}:${/\s/.test(value) ? `"${value}"` : value}`),
    )
    .join(" ");
}

export const runs = async (query: string[], options: RunsOptions) => {
  const now = Date.now();
  const { tokens, errors } = parseRunQuery(`${query.join(" ")} ${flagsAsQuery(options)}`, now);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`ngn: ${error}\n`);
    process.exitCode = 1;
    return;
  }
  const limit = options.limit === undefined ? 50 : Number(options.limit);
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
    const rows = await store.runs(tokens, now, limit);
    if (options.json) {
      process.stdout.write(`${renderJson(rows.map(runJson))}\n`);
      return;
    }
    if (rows.length === 0) {
      process.stderr.write("no runs match\n");
      return;
    }
    const table = rows.map((run) => ({
      run: run.id,
      task: taskName(run),
      status: runCell(run),
      started: formatDateTime(now, run.started_at ?? run.created_at),
      duration: run.duration_ms == null ? "—" : formatMs(run.duration_ms),
    }));
    process.stdout.write(`${renderTable(table, Object.keys(table[0]!))}\n`);
    process.stderr.write(
      `\n${plural(rows.length, "run")}${rows.length === limit ? ` (the newest ${limit}; --limit for more)` : ""}\n`,
    );
  } finally {
    store.close();
  }
};
