#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./cliCmd/init.js";
import { run } from "./cliCmd/run.js";
import { runOnce } from "./cliCmd/runOnce.js";
import { runSingle } from "./cliCmd/runSingle.js";
import { compile } from "./cliCmd/compile.js";
import { initDbFile } from "./cliCmd/initDbFile.js";
import { addTask } from "./cliCmd/addTask.js";
import { sql } from "./cliCmd/sql.js";
import { VERSION } from "./version.js";
import { DEFAULT_API_PORT, DEFAULT_MATCH_PATTERN } from "./constants.js";
const DEBUG_MODE = Boolean(process.env.DEBUG);
const program = new Command();

/** Read once, by a caller who cannot ask a follow-up: examples first, then facts. */
const INTRO = `
Examples
  ngn init                        create ngn.config.ts + tasks/
  ngn add scrape.ts               create tasks/scrape.ts from a template
  ngn run                         schedule every matching task   (blocks)
  ngn run --match "api/**/*.ts"   schedule a subset              (blocks)
  ngn run:once tasks/scrape.ts    run one task now, then exit
  ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20"

Blocking: run, run:single hold the terminal until Ctrl-C. All others exit.

Task file
  export const timing = "*/5 * * * * *"    // cron, 6 fields, seconds first
  export const task = async (ctx) => {}    // required
  optional: shouldSkip, onSuccess, onError, onComplete
  ctx: log.info/error/warning, kv.get/set/delete, timing.start, env, meta,
       sqlite (own db per task file, no setup)
  Only your file is bundled; imports resolve from your node_modules.

ngn.config.ts
  dbPath   ":memory:" (default) | "file:./ngn.db"   :memory: persists nothing
  port     ${DEFAULT_API_PORT}
  match    ["${DEFAULT_MATCH_PATTERN}"]                        globs relative to root
  envFile  ".env"

ctx.sqlite
  tasks/scrape.ts writes tasks/scrape.db. Confined to the task's own folder.
  execute(sql, args), batch(stmts), initDB({file, migrations}), destroyDB(file)

Results
  ngn sql --help      table schemas and example queries
  ngnui --db <file>   dashboard, separate paid module
  Both require dbPath to be a file: URL.
`;

program
  .name("ngn")
  .description("Schedule TypeScript and JavaScript task files with cron and record every run")
  .version(VERSION)
  .addHelpText("after", INTRO);

program
  .command("init")
  .description("Create ngn.config.ts and tasks/")
  .option("--dbFile <path>", "dbPath to write, e.g. ./ngn.db (default: :memory:)")
  .option("--apiPort <port>", `Live server port (default: ${DEFAULT_API_PORT})`)
  .option("--match <glob>", `Task glob, relative to root (default: ${DEFAULT_MATCH_PATTERN})`)
  .option("--configFile <path>", "Config filename to write (default: ngn.config.ts)")
  .option("--envFile <path>", "Env file path to record in config (default: .env)")
  .option("--root <path>", "Project root (default: cwd)")
  .action(init);

program
  .command("add")
  .description("Create tasks/<filePath> from a template")
  .argument("<filePath>", "Path under tasks/, e.g. scrape.ts or group/scrape.ts")
  .option("--root <path>", "Project root (default: cwd)")
  .action(addTask);

program
  .command("run")
  .description("Schedule all matching tasks (blocks)")
  .option("--root <path>", "Project root (default: cwd)")
  .option(
    "--match <glob>",
    "Filter the config `match` results; tested against the task path relative to root",
  )
  .addHelpText(
    "after",
    `
Matching
  The pattern is tested against the task path relative to root, so it must
  include the directory: "tasks/scrape.ts" or "**/scrape.ts" match,
  "scrape.ts" matches nothing. Quote globs so the shell does not expand them.

Examples
  ngn run --match "group/**/*.ts"
  ngn run --match "group/{auth,user}/*.ts"
`,
  )
  .action(run);

program
  .command("run:single")
  .description("Schedule one file on a cron pattern (blocks)")
  .argument("<filePath>", "Path to the task file, relative to root or absolute")
  .requiredOption("-t, --timing <cron>", "6-field cron, seconds first: '*/2 * * * * *'")
  .option("--root <path>", "Project root (default: cwd)")
  .addHelpText(
    "after",
    `
Ignores ngn.config.ts: no .env is loaded (ctx.env is empty) and the run
database is :memory:, so nothing is recorded. Use \`ngn run --match\` to
schedule one configured task instead.
`,
  )
  .action(runSingle);

program
  .command("run:once")
  .description("Run one matching task immediately, then exit")
  .argument("<pattern>", "Task path relative to root, e.g. tasks/scrape.ts")
  .option("--root <path>", "Project root (default: cwd)")
  .addHelpText(
    "after",
    `
Only tasks already covered by \`match\` in ngn.config.ts are candidates, and
the pattern is tested against the task path relative to root. Runs the first
match. Exits non-zero if the task throws.
`,
  )
  .action(runOnce);

program
  .command("sql")
  .description("Query the run database and print rows")
  .argument("<query>", "SQL query to run")
  .option("--db <path>", "Database file. Defaults to dbPath in ngn.config.ts")
  .option("--root <path>", "Root directory to read ngn.config.ts from")
  .option("--json", "Emit a JSON array of objects. Prefer this when parsing")
  .option("--csv", "Emit CSV")
  .option("--max-width <n>", "Truncate table cells at n characters. 0 disables")
  .addHelpText(
    "after",
    `
Tables
  file_tasks           id, path, parent_path, status, created_at, updated_at
  file_task_versions   id, file_task_id, version, md5_hash, compiled_code
  task_runs            id, file_task_id, file_task_version_id, started_at,
                       ended_at, created_at
                       status: pending | skipped | running | success | failure
  logs                 id, file_task_id, task_run_id, status, value, created_at
  timings              id, file_task_id, task_run_id, label, value, created_at
  kvs                  id, file_task_id, key, value, created_at

  Times are unix milliseconds. Rows -> stdout; counts and errors -> stderr.

Examples
  ngn sql "SELECT status, COUNT(*) FROM task_runs GROUP BY status"
  ngn sql "SELECT t.path, r.status, r.ended_at - r.started_at AS ms
           FROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id
           ORDER BY r.id DESC LIMIT 20"
  ngn sql "SELECT * FROM logs WHERE status = 'error' ORDER BY id DESC" --json
`,
  )
  .action(sql);

if (DEBUG_MODE) {
  program
    .command("compile")
    .description("Compile all matching tasks and print the output")
    .option("--root <path>", "Project root (default: cwd)")
    .option("--match <glob>", "Filter the config `match` results")
    .action(compile);

  program
    .command("db:init")
    .description("Create the database file if it does not exist")
    .argument("<dbPath>", "Database file path")
    .action(initDbFile);
}

program.parse(process.argv);
