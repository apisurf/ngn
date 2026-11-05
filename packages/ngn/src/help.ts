/**
 * `ngn --help`, `ngn help <topic>` and `ngn help --all`.
 *
 * The first screen is the commands, grouped by what the reader wants to do, and
 * marked when they hold the terminal. Reference material — the task file, the
 * config, `ctx`, queues, the database tables — is one step away as a topic, so
 * a person sees the map first. `help --all` prints everything in one go,
 * examples first, for a reader (often an agent) that reads once and cannot ask
 * a follow-up.
 */
import type { Command } from "commander";
import { DEFAULT_API_PORT, DEFAULT_MATCH_PATTERN } from "./constants.js";

export interface HelpEntry {
  usage: string;
  summary: string;
  /** Holds the terminal until Ctrl-C. */
  blocks?: boolean;
}

/** The first screen, in reading order. A command not listed here is not in the overview. */
export const HELP_GROUPS: { title: string; entries: HelpEntry[] }[] = [
  {
    title: "Set up",
    entries: [
      { usage: "init", summary: "create ngn.config.ts and tasks/" },
      { usage: "add <name>", summary: "create tasks/<name> from a template" },
    ],
  },
  {
    title: "Run",
    entries: [
      { usage: "run [task…]", summary: "schedule the matching tasks", blocks: true },
      { usage: "run <task> --once", summary: "run one task now, record it, exit" },
      { usage: "run <file> -t <cron>", summary: "schedule one file on a pattern", blocks: true },
    ],
  },
  {
    title: "Inspect",
    entries: [
      { usage: "status", summary: "is anything wrong: the verdict and every task" },
      { usage: "runs [filter…]", summary: "run history, filtered (status:failed since:24h)" },
      { usage: "show <run>", summary: "one run: why, its logs, timings and result" },
      { usage: "logs <task|run>", summary: "log lines, oldest first" },
      { usage: "ui [run]", summary: "open the dashboard, or one run in it", blocks: true },
      { usage: "sql <query>", summary: "query the run database, straight SQL" },
    ],
  },
];

export const TOPICS = {
  task: `Task file
  A task file exports \`timing\` and \`task\`; everything else is optional.

  export const timing = "*/5 * * * * *"    // cron: 6 fields seconds first, or 5
  export const task = async (ctx) => {}    // required; its return is stored

  overlap      "skip" (default) | "allow"   a tick while the last run is going
  budget       "4m"                         the longest a run should take
  retry        { attempts, delay, breaker } retry a failed run inside its tick
  exclusive    "browser" | ["a", "b"]       locks held for the whole run
  shouldSkip, shouldRetry, onSuccess, onError, onComplete    hooks, given ctx

  Durations are milliseconds or "500ms", "30s", "4m", "2h", "1d".
  Only your file is bundled; imports resolve from your node_modules.
  See also: ngn help ctx`,

  config: `ngn.config.ts
  import { defineConfig } from "@apisurf/ngn";
  export default defineConfig({ ... });

  dbPath   "file:./ngn.sqlite" (what init writes) | ":memory:" (unset; keeps nothing)
  port     ${DEFAULT_API_PORT}       runtime port: where \`ngn run\` serves the editor
  match    ["${DEFAULT_MATCH_PATTERN}"]   globs relative to the project root
  envFile  ".env"     variables handed to tasks as ctx.env`,

  ctx: `ctx — what a task gets
  log.info/warning/error(text)   log lines, stored with the run
  timing.start(label)            returns a function that records how long since
  kv.get/set/delete(key)         small values that outlive runs, per task
  run                            id, scheduledAt, nextAt, deadline, signal
  sqlite                         the task's own database (below)
  queue(name, { db })            a job queue (ngn help queue)
  lock(name, fn, { wait, ttl })  a named lock shared with other tasks
  env                            the variables from envFile
  meta                           the task file's path and ids

ctx.sqlite
  tasks/scrape.ts writes tasks/scrape.db. Confined to the task's own folder.
  execute(sql, args), batch(stmts), initDB({ file, migrations }), destroyDB(file)`,

  queue: `Queues
  const jobs = await ctx.queue("pages", { db, maxAttempts: 3 });
  Kept in _ngn_jobs in the database you open it on; two tasks in one folder
  that open the same file share it.

  add(job | jobs)          { key, group, payload, priority, delay, maxAttempts }
  work(handler, options)   { concurrency, max, perGroup, until, worker }; stops at
                           ctx.run.deadline and returns a summary to return from task
  claim / complete / fail / release      settle jobs yourself when work() does not fit
  park(filter) / reopen(filter)          set jobs aside and bring them back
  prune({ olderThan }) / get(key) / stats()

  Job status: ready, leased, done, dead, parked.
  ngn sql --db tasks/pages.db "SELECT status, COUNT(*) FROM _ngn_jobs GROUP BY 1"`,

  schema: `The run database (what \`ngn sql\` and ngnui read)
  file_tasks           id, path, parent_path, status, created_at, updated_at
  file_task_versions   id, file_task_id, version, md5_hash, compiled_code
  task_runs            id, file_task_id, file_task_version_id, started_at,
                       ended_at, created_at, result (what task returned, JSON),
                       retry_of (first run of a retried tick), skip_reason
                       status: pending | skipped | running | success | failure
  logs                 id, file_task_id, task_run_id, status, value, created_at
  timings              id, file_task_id, task_run_id, label, value, created_at
  kvs                  id, file_task_id, key, value, created_at
  locks                name, holder, task_run_id, acquired_at, expires_at

  Times are unix milliseconds. Both readers need dbPath to be a file: URL.
  ngnui --db <file>    the same file as a dashboard, from npm i -g @apisurf/ngnui`,
} as const;

export type Topic = keyof typeof TOPICS;

const EXAMPLES = `Examples
  ngn init                        create ngn.config.ts + tasks/
  ngn add scrape.ts               create tasks/scrape.ts from a template
  ngn run                         schedule every matching task   (blocks)
  ngn run "api/**/*.ts"           schedule a subset              (blocks)
  ngn run scrape.ts --once        run one task now, then exit
  ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20"`;

const USAGE_WIDTH = 24;

/** The first screen of `ngn --help`. */
export function overview(description: string): string {
  const lines = [`ngn — ${description}`, "", "Usage: ngn <command> [options]"];
  const width = Math.max(...HELP_GROUPS.flatMap((g) => g.entries.map((e) => e.summary.length))) + 2;
  for (const group of HELP_GROUPS) {
    lines.push("", group.title);
    for (const entry of group.entries) {
      const summary = entry.blocks ? `${entry.summary.padEnd(width)}(blocks)` : entry.summary;
      lines.push(`  ${entry.usage.padEnd(USAGE_WIDTH)}${summary}`);
    }
  }
  lines.push(
    "",
    "Reference",
    `  ${"help <topic>".padEnd(USAGE_WIDTH)}${Object.keys(TOPICS).join(", ")}`,
    `  ${"help <command>".padEnd(USAGE_WIDTH)}one command's options`,
    `  ${"help --all".padEnd(USAGE_WIDTH)}everything at once, examples first`,
    "",
    "Options",
    `  ${"-V, --version".padEnd(USAGE_WIDTH)}the version`,
    `  ${"-h, --help".padEnd(USAGE_WIDTH)}this screen`,
    "",
  );
  return lines.join("\n");
}

/** Everything, for a reader that reads once: examples, every topic, then every command. */
export function everything(program: Command): string {
  const listed = new Set(
    HELP_GROUPS.flatMap((group) => group.entries.map((e) => e.usage.split(" ")[0])),
  );
  const commands = program.commands
    .filter((command) => listed.has(command.name()))
    .map((command) => `ngn ${command.name()}\n${indent(command.helpInformation())}`);
  return [
    EXAMPLES,
    "Blocking: run holds the terminal until Ctrl-C, unless --once. All others exit.",
    ...Object.values(TOPICS),
    ...commands,
  ].join("\n\n");
}

function indent(text: string): string {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}

export function isTopic(name: string): name is Topic {
  return Object.hasOwn(TOPICS, name);
}
