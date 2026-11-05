// The filter language as SQL, for both readers of the run database: ngnui and
// `ngn runs`. It expects the run query's aliases — `task_runs r`, `file_tasks t`
// and `file_task_versions v` — and leaves the rest of the statement to them.

import type { RunToken, RunTokenKey } from "./query.js";
import { matchTaskName } from "./match.js";

export type SqlValue = string | number;

export interface RunFilterContext {
  /** Every task path in the file, to resolve `task:` names against. */
  paths: readonly string[];
  /** The ids of the runs that are Stalled now. */
  stalledIds: readonly number[];
}

/** Runs of code sent from the Editor: throwaway files at the project root. */
export const EDITOR_TASK_SQL = "(t.parent_path = '.' AND t.path GLOB 'live-task-*')";

/** A Stalled run is a set of ids, worked out against the clock, not a column. */
const IN_STALLED = "r.id IN (SELECT value FROM json_each(?))";

/**
 * `WHERE` conditions for the tokens, joined with AND, and their arguments.
 * Tokens with one key (and sign) are alternatives; different keys must all hold.
 * `skip` leaves out some keys, which is how a facet counts its own values.
 */
export function runFilterSql(
  tokens: readonly RunToken[],
  context: RunFilterContext,
  skip: readonly RunTokenKey[] = [],
): { where: string[]; args: SqlValue[] } {
  const where: string[] = [];
  const args: SqlValue[] = [];
  const groups = new Map<string, RunToken[]>();
  for (const token of tokens) {
    if (skip.includes(token.key)) continue;
    const key = `${token.key}:${token.negate}`;
    groups.set(key, [...(groups.get(key) ?? []), token]);
  }
  for (const group of groups.values()) {
    const parts = group.map((token) => condition(token, context, args));
    const either = `(${parts.join(" OR ")})`;
    where.push(group[0]!.negate ? `NOT ${either}` : either);
  }
  return { where, args };
}

/** The status word a run reads as, in SQL, for counting runs by it. */
export function statusWordSql(stalledIds: readonly number[]): { sql: string; args: SqlValue[] } {
  return {
    sql: `CASE WHEN ${IN_STALLED} THEN 'stalled'
               WHEN r.status IN ('running', 'pending') THEN 'running'
               WHEN r.status = 'success' THEN 'succeeded'
               WHEN r.status = 'failure' THEN 'failed'
               ELSE r.status END`,
    args: [JSON.stringify(stalledIds)],
  };
}

const STORED = { succeeded: "success", failed: "failure", skipped: "skipped" } as const;

function condition(token: RunToken, context: RunFilterContext, args: SqlValue[]): string {
  switch (token.key) {
    case "text":
      args.push(`%${token.value}%`);
      return "t.path LIKE ?";
    case "task": {
      const matched = matchTaskName(context.paths, token.value);
      if (matched.length) {
        args.push(JSON.stringify(matched));
        return "t.path IN (SELECT value FROM json_each(?))";
      }
      args.push(`%${token.value}%`);
      return "t.path LIKE ?";
    }
    case "status":
      if (token.value === "stalled") {
        args.push(JSON.stringify(context.stalledIds));
        return IN_STALLED;
      }
      if (token.value === "running") {
        args.push(JSON.stringify(context.stalledIds));
        return `(r.status IN ('running', 'pending') AND NOT ${IN_STALLED})`;
      }
      args.push(STORED[token.value]);
      return "r.status = ?";
    case "origin":
      return token.value === "editor" ? EDITOR_TASK_SQL : `NOT ${EDITOR_TASK_SQL}`;
    case "since":
      args.push(token.at);
      return "COALESCE(r.started_at, r.created_at) >= ?";
    case "until":
      args.push(token.at);
      return "COALESCE(r.started_at, r.created_at) < ?";
    case "version":
      args.push(token.version);
      return "v.version = ?";
  }
}
