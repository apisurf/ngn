import invariant from "tiny-invariant";
import { getCwd, handleSigInt, handleSigTerm, createFileDescriptor } from "@apisurf/ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  isCronPatternValid,
  scheduleTask,
  setupDbClient,
  getDbClient,
  closeTaskDatabases,
  failedRunId,
} from "@apisurf/ngn-core";
import { existsSync } from "node:fs";
import { CliOptions } from "../types.js";
import { getRunConfig } from "../config.js";
import { describeAmbiguous, describeNoMatch } from "../util/matchTasks.js";
import { describeDbPath } from "../util/dbPath.js";
import { describeUnrecorded, printProblems } from "../util/reportRun.js";
import {
  DEFAULT_DB_PATH,
  DEFAULT_API_PORT,
  DEFAULT_ENV_FILE,
  DEFAULT_MATCH_PATTERN,
} from "../constants.js";

/**
 * Creates a simple config for running a single task file without requiring a config file.
 * Uses defaults for all configuration options and an in-memory database.
 */
async function getSingleTaskConfig(rootDir: string, filePath: string): Promise<CliOptions> {
  // Create file descriptor for the single task file
  const descriptor = createFileDescriptor({
    rootDir,
    path: filePath,
  });

  const sourcePath = descriptor.path.absolute;

  return {
    rootDir: rootDir,
    configFileOptions: {
      match: [DEFAULT_MATCH_PATTERN],
      dbPath: DEFAULT_DB_PATH,
      port: DEFAULT_API_PORT,
      envFile: DEFAULT_ENV_FILE,
    },
    sourcePaths: [sourcePath],
    descriptors: { [sourcePath]: descriptor },
    compileConfig: {
      minify: false,
      silent: true,
    },
    env: {}, // No environment variables loaded
    timing: null,
    taskMatches: [],
  };
}

/**
 * One task on a pattern of the caller's choosing, with everything else the
 * project's: its config, env and database, so its runs are recorded like any
 * other. The task is found the way `ngn run` finds one; a file outside the
 * config's `match` is taken by its path. Null (after reporting) when the name
 * fits several tasks or nothing at all.
 */
async function getConfiguredTaskConfig(
  rootDir: string,
  filePath: string,
): Promise<CliOptions | null> {
  const config = await getRunConfig(rootDir, [filePath]);
  const match = config.taskMatches[0]!;
  if (match.paths.length === 1) return config;
  if (match.paths.length > 1) {
    console.error(describeAmbiguous(match));
    return null;
  }
  const descriptor = createFileDescriptor({ rootDir, path: filePath });
  if (!existsSync(descriptor.path.absolute)) {
    console.error(describeNoMatch(match));
    return null;
  }
  const sourcePath = descriptor.path.absolute;
  return { ...config, sourcePaths: [sourcePath], descriptors: { [sourcePath]: descriptor } };
}

export const runSingle = async (
  filePath: string,
  options: { root?: string; timing: string; config?: boolean },
) => {
  const rootDirAbs = getCwd(process.cwd(), options.root);

  // Bad input from the caller, not a broken invariant: report it without a stack.
  if (!isCronPatternValid(options.timing)) {
    console.error(
      `ngn: invalid cron pattern "${options.timing}".\n` +
        "     Expected 6 fields, seconds first, e.g. '*/2 * * * * *'.",
    );
    process.exitCode = 1;
    return;
  }

  // `--no-config` is the old run:single: nothing loaded, nothing recorded.
  const config =
    options.config === false
      ? await getSingleTaskConfig(rootDirAbs, filePath)
      : await getConfiguredTaskConfig(rootDirAbs, filePath);
  if (!config) {
    process.exitCode = 1;
    return;
  }
  let scheduledTask: ReturnType<typeof scheduleTask> | null = null;

  try {
    await setupDbClient(config.configFileOptions.dbPath);
    const dbClient = getDbClient();
    invariant(dbClient, "DB client not initialized");

    const compiler = new Compiler(config.compileConfig);
    // Compile to in-memory string instead of writing to disk
    const result = await compiler.compile(config.sourcePaths);
    const generateControlsFn = createControlsGenerator({
      dbClient,
      env: config.env,
      report: printProblems(),
    });

    // Get the first (and only) compiled entry
    const [sourcePath, compiledCode] = [...result.compiled.entries()][0];
    const descriptor = config.descriptors[sourcePath];
    invariant(descriptor, `No descriptor found for source path: ${sourcePath}`);

    const task = new Task({
      buildConfigFn: generateControlsFn,
      entryParams: {
        compiledCode,
        descriptor,
        tasksRootDir: config.rootDir,
      },
    });

    // Load the task to ensure it's valid
    await task.loadEntry();
    invariant(task.hasTaskExport(), `Task function is missing in ${filePath}`);

    // Schedule the task with the provided cron pattern
    // A recorded failure was printed by `report`; this is what threw before a run existed.
    scheduledTask = scheduleTask(task, options.timing, (error) => {
      if (failedRunId(error) == null) console.error(describeUnrecorded(filePath, error));
    });

    const db = describeDbPath(config.configFileOptions.dbPath);
    console.log(
      `scheduled ${filePath} on ${options.timing}, recording to ${db.absolute ?? ":memory: (kept nowhere)"}  (Ctrl-C to stop)`,
    );
  } catch (error) {
    console.error(`ngn: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  handleSigInt(async () => {
    scheduledTask?.stop();
    closeTaskDatabases();
    process.exit(0);
  });
  handleSigTerm(async () => {
    scheduledTask?.stop();
    closeTaskDatabases();
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
};
