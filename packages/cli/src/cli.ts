#!/usr/bin/env node
import { Command } from "commander";
import { init } from "./cliCmd/init";
import { run } from "./cliCmd/run";
import { runOnce } from "./cliCmd/runOnce";
import { runSingle } from "./cliCmd/runSingle";
import { compile } from "./cliCmd/compile";
import { initDbFile } from "./cliCmd/initDbFile";
import { addTask } from "./cliCmd/addTask";
import { http } from "./cliCmd/http";
import { TaskContext } from "ngn-core";

const DEBUG_MODE = Boolean(process.env.DEBUG);
const program = new Command();

program
  .name("cli")
  .description("Run tasks using the ngn CLI")
  .version(require("../package.json").version);

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
  // to run a single task inside the tasks directory => op3 run --match "tasks/single-task.ts" or op3 run --match "single-task.ts"
  // to glob match tasks inside the tasks directory => op3 run --match "group/**/*.ts" or op3 run --match "group/{auth,user}/*.ts" (use parenthesis to escape CLI expansion)
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
  .command("http")
  .description("Run only http server")
  .option("--root <path>", "root directory path")
  .action(http);

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

export { TaskContext };
