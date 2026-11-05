/**
 * Every command, flag and help text `ngn` has, built without running anything:
 * the actions are passed in, so a test can parse a command line and see what
 * the action would get.
 *
 * Flags are kebab-case and named from the glossary (DEV/ia/glossary.md):
 * `--db`, `--port`, `--config`, `--env-file`. A name a flag had before stays as
 * a hidden alias.
 */
import { Command, Option } from "commander";
import { VERSION } from "./version.js";
import { everything, isTopic, overview, TOPICS } from "./help.js";
import { DEFAULT_API_PORT, DEFAULT_MATCH_PATTERN } from "./constants.js";

const DESCRIPTION = "schedule TypeScript and JavaScript task files with cron and record every run";

type Action = Parameters<Command["action"]>[0];

export interface RunFlags {
  once?: boolean;
  timing?: string;
  /** False with --no-config. */
  config: boolean;
  root?: string;
  /** Before positional task names. */
  match?: string;
}

/**
 * Which of `run`'s forms a command line asked for. --once and --timing each
 * take exactly one task; reported here, before anything is compiled.
 */
export function runForm(actions: Actions, tasks: string[], flags: RunFlags) {
  const names = flags.match ? [...tasks, flags.match] : tasks;
  const single = flags.once ? "--once" : flags.timing !== undefined ? "--timing" : null;
  if (single && names.length !== 1) {
    console.error(`ngn: ${single} takes one task (got ${names.length || "none"})`);
    process.exitCode = 1;
    return;
  }
  if (flags.once && flags.timing !== undefined) {
    console.error("ngn: --once and --timing do not go together");
    process.exitCode = 1;
    return;
  }
  if (flags.once) return actions.runOnce(names[0], { root: flags.root });
  if (flags.timing !== undefined) {
    return actions.runSingle(names[0], {
      root: flags.root,
      timing: flags.timing,
      config: flags.config,
    });
  }
  return actions.run({ root: flags.root, tasks: names });
}

export interface Actions {
  init: Action;
  addTask: Action;
  run: Action;
  runOnce: Action;
  runSingle: Action;
  sql: Action;
  ui: Action;
  status: Action;
  runs: Action;
  show: Action;
  logs: Action;
  compile: Action;
  initDbFile: Action;
}

/** The options every command that reads the run database takes. */
function dbOptions(command: Command): Command {
  return command
    .option("--db <path>", "Database file. Defaults to dbPath in ngn.config.ts")
    .option("--root <path>", "Root directory to read ngn.config.ts from")
    .option("--json", "Emit JSON. Prefer this when parsing");
}

export function buildProgram(actions: Actions, { debug = false } = {}): Command {
  const program = new Command();

  program
    .name("ngn")
    .description(DESCRIPTION)
    .version(VERSION)
    // `help` is a command of its own below, with topics.
    .helpCommand(false);
  // The overview, for `ngn`, `ngn --help` and `ngn help`; each command keeps its own.
  program.helpInformation = () => overview(DESCRIPTION);

  program
    .command("help")
    .description("Show a topic, a command's options, or everything")
    .argument("[topic]", `${Object.keys(TOPICS).join(", ")}, or a command`)
    .option("--all", "Everything at once, examples first")
    .action((topic: string | undefined, options: { all?: boolean }) => {
      if (options.all) return void process.stdout.write(`${everything(program)}\n`);
      if (!topic) return void process.stdout.write(overview(DESCRIPTION));
      if (isTopic(topic)) return void process.stdout.write(`${TOPICS[topic]}\n`);
      const command = program.commands.find((c) => c.name() === topic);
      if (command) return void process.stdout.write(command.helpInformation());
      console.error(`ngn: no help topic "${topic}". Topics: ${Object.keys(TOPICS).join(", ")}`);
      process.exitCode = 1;
    });

  program
    .command("init")
    .description("Create ngn.config.ts and tasks/")
    .option(
      "--db <path>",
      "Database to record runs in, or :memory: to keep nothing (default: ./ngn.sqlite)",
    )
    .option(
      "--port <n>",
      `Runtime port: where \`ngn run\` serves the editor (default: ${DEFAULT_API_PORT})`,
    )
    .option("--match <glob>", `Task glob, relative to root (default: ${DEFAULT_MATCH_PATTERN})`)
    .option("--config <path>", "Config filename to write (default: ngn.config.ts)")
    .option("--env-file <path>", "Env file to record in the config (default: .env)")
    .option("--root <path>", "Project root (default: cwd)")
    // The names these had before, kept working but out of the help.
    .addOption(new Option("--dbFile <path>").hideHelp())
    .addOption(new Option("--apiPort <n>").hideHelp())
    .addOption(new Option("--configFile <path>").hideHelp())
    .addOption(new Option("--envFile <path>").hideHelp())
    .action(actions.init);

  program
    .command("add")
    .description("Create tasks/<filePath> from a template")
    .argument("<filePath>", "Path under tasks/, e.g. scrape.ts or group/scrape.ts")
    .option("--root <path>", "Project root (default: cwd)")
    .action(actions.addTask);

  program
    .command("run")
    .description("Schedule tasks (blocks), or run one now with --once")
    .argument("[task...]", "Task names or globs; every task the config matches when none")
    .option("--once", "Run the one named task now, record it, and exit")
    .option("-t, --timing <cron>", "Schedule the one named file on this pattern instead of its own")
    .option("--no-config", "With --timing: ignore ngn.config.ts, load no env, record nothing")
    .option("--root <path>", "Project root (default: cwd)")
    .addOption(new Option("--match <glob>").hideHelp())
    .addHelpText(
      "after",
      `
Forms
  ngn run                          schedule every task          (blocks)
  ngn run scrape.ts api/**         schedule these               (blocks)
  ngn run scrape.ts --once         run it now, record it, exit
  ngn run scrape.ts -t "*/2 * * * * *"
                                   schedule it on this pattern  (blocks)

Matching
  A name is tried as the path from the project root, then under tasks/, then
  as the end of a path: "tasks/scrape.ts", "scrape.ts" and "scrape" all find
  tasks/scrape.ts. A glob ("api/**/*.ts") is matched against the path from the
  root. Quote globs so the shell does not expand them. Only tasks covered by
  \`match\` in ngn.config.ts are candidates, except that --timing also takes a
  file outside it by its path.

--once exits non-zero if the task throws, or if the name fits several tasks.
`,
    )
    .action((tasks: string[], options: RunFlags) => runForm(actions, tasks, options));

  // The names these forms had before `run` took them all, kept working but out of the help.
  program
    .command("run:once", { hidden: true })
    .argument("<task>")
    .option("--root <path>")
    .action(actions.runOnce);

  program
    .command("run:single", { hidden: true })
    .argument("<filePath>")
    .requiredOption("-t, --timing <cron>")
    .option("--root <path>")
    .action((filePath: string, options: { root?: string; timing: string }) =>
      actions.runSingle(filePath, { ...options, config: false }),
    );

  dbOptions(
    program
      .command("status")
      .description("Is anything wrong: the verdict, then every task's health"),
  )
    .addHelpText(
      "after",
      `
Exits 0 when every task is healthy, 2 when the verdict names a problem
(failing, stalled, a lock left behind), and 1 when it cannot read.
`,
    )
    .action(actions.status);

  dbOptions(
    program
      .command("runs")
      .description("Run history, newest first, filtered like ngnui's Runs page")
      .argument("[filter...]", 'Filter tokens, e.g. "task:extract status:failed since:24h"')
      .option("--task <name>", "Only this task: a name, as `ngn run` takes one, or part of a path")
      .option(
        "--status <word>",
        "succeeded, failed, skipped, running or stalled; a comma for several",
      )
      .option("--origin <word>", "scheduled or editor")
      .option("--since <time>", "30m, 24h, 7d, 2w back from now, or a date (2026-10-27)")
      .option("--until <time>", "The same, for the other end")
      .option("--limit <n>", "Most runs to list (default 50)"),
  )
    .addHelpText(
      "after",
      `
Filters
  key:value tokens, or the flags above; a leading - excludes (-status:skipped),
  several tokens with one key are alternatives, and other words match task
  paths. Keys: task, status, origin, since, until, version.

Examples
  ngn runs --status failed --since 24h
  ngn runs "task:extract -status:skipped"
  ngn runs status:stalled --json
`,
    )
    .action(actions.runs);

  dbOptions(
    program
      .command("show")
      .description("One run: what happened and why, its logs, timings and result")
      .argument("<run>", "A run id, e.g. 41"),
  ).action(actions.show);

  dbOptions(
    program
      .command("logs")
      .description("Log lines of a run, or of a task across its runs, oldest first")
      .argument("<task|run>", "A run id, or a task name as `ngn run` takes one")
      .option("--level <level>", "info, warn or error: that level and above (default info)")
      .option("--limit <n>", "The newest n lines (default 200)")
      .option("--lifecycle", "Include ngn's own lines around each run"),
  ).action(actions.logs);

  program
    .command("ui")
    .description("Open the dashboard on this project's database (blocks)")
    .argument("[run]", "A run id to open the browser on, e.g. 41")
    .option("--db <path>", "Database file. Defaults to dbPath in ngn.config.ts")
    .option("--port <n>", "Port for ngnui to serve on (default: 3000, or the next free one)")
    .option("--no-open", "Start the dashboard without opening a browser")
    .option("--root <path>", "Project root (default: cwd)")
    .addHelpText(
      "after",
      `
Starts ngnui: the project's own @apisurf/ngnui, else one on PATH, else through
npx. It runs in the project folder, so the editor connects to \`ngn run\`
whenever one is up for this project.
`,
    )
    .action(actions.ui);

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
${TOPICS.schema}

  Rows -> stdout; counts and errors -> stderr.

Examples
  ngn sql "SELECT status, COUNT(*) FROM task_runs GROUP BY status"
  ngn sql "SELECT t.path, r.status, r.ended_at - r.started_at AS ms
           FROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id
           ORDER BY r.id DESC LIMIT 20"
  ngn sql "SELECT * FROM logs WHERE status = 'error' ORDER BY id DESC" --json
`,
    )
    .action(actions.sql);

  if (debug) {
    program
      .command("compile")
      .description("Compile all matching tasks and print the output")
      .option("--root <path>", "Project root (default: cwd)")
      .option("--match <glob>", "Filter the config `match` results")
      .action(actions.compile);

    program
      .command("db:init")
      .description("Create the database file if it does not exist")
      .argument("<dbPath>", "Database file path")
      .action(actions.initDbFile);
  }

  return program;
}
