#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./cliCmd/init";
import { run } from "./cliCmd/run";
import { runOnce } from "./cliCmd/runOnce";
import { runSingle } from "./cliCmd/runSingle";
import { compile } from "./cliCmd/compile";
import { initDbFile } from "./cliCmd/initDbFile";
import { addTask } from "./cliCmd/addTask";
import { sql } from "./cliCmd/sql";
import { VERSION } from "./version";
import { DEFAULT_API_PORT, DEFAULT_MATCH_PATTERN } from "./constants";
const DEBUG_MODE = Boolean(process.env.DEBUG);
const program = new Command();

/**
 * The intro screen is the only thing a caller who has never seen ngn reads
 * before deciding what to type — increasingly that caller is an agent, which
 * gets one shot at it and cannot ask a follow-up. A bare command list does not
 * say what a task file has to export, where results end up, or that `run`
 * never returns, so it leads with those three and keeps the tour to a screen.
 */
const INTRO = `
What it is
  A cron scheduler for TypeScript and JavaScript task files. \`ngn run\` loads
  every file matching \`match\`, schedules each on its own cron pattern, and
  records every run — status, logs, timings — into one SQLite database.

Inputs
  ngn.config.ts  dbPath (default :memory:), port (default ${DEFAULT_API_PORT}),
                 match (default ${DEFAULT_MATCH_PATTERN}), envFile (default .env)
  a task file    export const timing = "*/5 * * * * *"  // cron, seconds first
                 export const task = async (ctx) => { ... }
                 ctx has log.info/error/warning, kv.get/set, timing.start, env,
                 and sqlite — its own database, no setup, kept next to the task
                 optional: shouldSkip, onSuccess, onError, onComplete
                 anything else, import it: only your code is bundled, imports
                 resolve from your node_modules

Interactive vs one-shot
  \`run\` and \`run:single\` do not exit — they hold the terminal until Ctrl-C.
  \`run:once\`, \`add\`, \`init\` and \`sql\` finish and exit; prefer those when
  nothing is there to press Ctrl-C.

Examples
  ngn init                          scaffold ngn.config.ts and tasks/
  ngn add scrape.ts                 write a new task file
  ngn run                           schedule every matching task (blocks)
  ngn run --match "api/**/*.ts"     schedule a subset — quote the glob
  ngn run:once tasks/scrape.ts      run one task now, then exit
  ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20"

Task data
  ctx.sqlite is a database per task file — tasks/scrape.ts uses tasks/scrape.db.
  execute(sql, args), batch(stmts), initDB({file, migrations}), destroyDB(file).
  A task can only open databases in its own folder, never a parent's.

Reading results
  \`ngn sql\` prints rows and exits — \`ngn sql --help\` lists the tables.
  \`ngnui --db <file>\` serves the same database as a dashboard.
  Both need dbPath set to a file: URL; the :memory: default keeps nothing.
`;

program
  .name("ngn")
  .description(
    "Schedule TypeScript and JavaScript task files with cron and record every run"
  )
  .version(VERSION)
  .addHelpText("after", INTRO);

program
  .command("init")
  .description("Initialize the ngn CLI configuration")
  .option("--dbFile <path>", "Database file path")
  .option("--apiPort <port>", "API port to run the server on")
  .option("--match <path>", "Task paths glob matching pattern")
  .option("--out <path>", "Output directory path")
  .option("--configFile <path>", "Config file path")
  .option("--envFile <path>", "Environment file path")
  .option("--root <path>", "Root directory path")
  .action(init);

program
  .command("add")
  .description("Add a file task to tasks directory")
  .argument("<filePath>", "File path of the task")
  .option("--root <path>", "Root directory path")
  .action(addTask);

program
  .command("run")
  .description("Run tasks")
  .option("--root <path>", "root directory path")
  // without this option, it will run all tasks in the tasks directory
  // the pattern is matched against the task path relative to the root, so it
  // has to cover the directory too: "tasks/single-task.ts" or "**/single-task.ts"
  // matches, a bare "single-task.ts" matches nothing
  // to glob match tasks inside the tasks directory => ngn run --match "group/**/*.ts" or ngn run --match "group/{auth,user}/*.ts" (use parenthesis to escape CLI expansion)
  .option("--match <path>", "Only run tasks matching the partial path")
  .action(run);

// schedule a single task with custom cron pattern
program
  .command("run:single")
  .description("Run a single task with a custom cron pattern")
  .argument("<filePath>", "File path of the task")
  .option(
    "-t, --timing <pattern>",
    "Cron pattern for scheduling (e.g., '*/2 * * * * *')"
  )
  .option("--root <path>", "root directory path")
  .action(runSingle);

// run specific task once without scheduling nor API/UI server
program
  .command("run:once")
  .description("Run a single task once")
  .argument("<filePath>", "File path of the task")
  .option("--root <path>", "root directory path")
  .action(runOnce);

program
  .command("sql")
  .description("Query the task database with SQLite and print the rows")
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
  task_runs            id, file_task_id, file_task_version_id, status
                       ('pending' | 'skipped' | 'running' | 'success' |
                       'failure'), started_at, ended_at, created_at
  logs                 id, file_task_id, task_run_id, status, value, created_at
  timings              id, file_task_id, task_run_id, label, value, created_at
  kvs                  id, file_task_id, key, value, created_at

  Times are unix milliseconds. Rows go to stdout, counts and errors to stderr.

Examples
  ngn sql "SELECT status, COUNT(*) FROM task_runs GROUP BY status"
  ngn sql "SELECT t.path, r.status, r.ended_at - r.started_at AS ms
           FROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id
           ORDER BY r.id DESC LIMIT 20"
  ngn sql "SELECT * FROM logs WHERE status = 'error' ORDER BY id DESC" --json
`
  )
  .action(sql);

if (DEBUG_MODE) {
  program
    .command("compile")
    .description("Compile all tasks")
    .option("--root <path>", "root directory path")
    .option("--match <path>", "Only run tasks matching the partial path")
    .action(compile);

  program
    .command("db:init")
    .description("Initialize the database file if it does not exist")
    .argument("<dbPath>", "Database file path")
    .action(initDbFile);
}

program.parse(process.argv);
