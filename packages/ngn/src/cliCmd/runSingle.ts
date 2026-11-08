import invariant from "tiny-invariant";
import { getCwd, createFileDescriptor } from "@apisurf/ngn-os";
import { describeTiming, type TimingValue } from "@apisurf/ngn-schema/describe";
import {
  Compiler,
  Task,
  TaskLibrary,
  TaskLibraryScheduler,
  createControlsGenerator,
  timingFromFlag,
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
import { describeUnrecorded, printProblems, printScheduleProblem } from "../util/reportRun.js";
import { onStopSignal } from "../util/stopSignal.js";
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
 * One task on a timing of the caller's choosing, with everything else the
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
  const timing = timingFromFlag(options.timing);
  if (timing == null) {
    console.error(
      `ngn: --timing "${options.timing}" is neither a duration nor a cron pattern.\n` +
        "     A duration runs the task that often on the leading edge, e.g. -t 5m;\n" +
        "     a pattern has 6 fields, seconds first, or 5, e.g. -t '*/2 * * * * *'.",
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
  let scheduler: TaskLibraryScheduler | null = null;

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

    const library = new TaskLibrary();
    library.add(
      new Task({
        buildConfigFn: generateControlsFn,
        entryParams: { compiledCode, descriptor, tasksRootDir: config.rootDir },
      }),
    );

    // The same engine as `ngn run`, on the caller's timing. A recorded failure
    // was printed by `report`; this is what threw before a run existed.
    scheduler = new TaskLibraryScheduler({
      taskLibrary: library,
      timing,
      onRunError: (path, error) => {
        if (failedRunId(error) == null) console.error(describeUnrecorded(path, error));
      },
      onScheduleProblem: printScheduleProblem,
    });
    const report = await scheduler.start();
    const [failed] = report.failed;
    if (failed) throw new Error(`${failed.path} not scheduled: ${failed.reason}`);

    const db = describeDbPath(config.configFileOptions.dbPath);
    const words = describeTiming(timing as TimingValue) ?? options.timing;
    console.log(
      `scheduled ${filePath} ${words}, recording to ${db.absolute ?? ":memory: (kept nowhere)"}  (Ctrl-C to stop)`,
    );
  } catch (error) {
    console.error(`ngn: ${error instanceof Error ? error.message : String(error)}`);
    closeTaskDatabases();
    process.exit(1);
  }

  onStopSignal(async () => {
    await scheduler?.stop();
    closeTaskDatabases();
  });

  // Keep the process running
  await new Promise(() => {});
};
