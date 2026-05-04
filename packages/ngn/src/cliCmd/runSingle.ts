import { isAbsolute } from "node:path";
import { validate, schedule, ScheduledTask } from "node-cron";
import invariant from "tiny-invariant";
import { handleSigInt, handleSigTerm, createFileDescriptor } from "ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
} from "ngn-core";
import { CliOptions } from "../types";
import {
  DEFAULT_DB_PATH,
  DEFAULT_API_PORT,
  DEFAULT_ENV_FILE,
  DEFAULT_MATCH_PATTERN,
} from "../constants";

/**
 * Creates a simple config for running a single task file without requiring a config file.
 * Uses defaults for all configuration options and an in-memory database.
 */
async function getSingleTaskConfig(
  rootDir: string,
  filePath: string
): Promise<CliOptions> {
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
      plugins: [],
    },
    sourcePaths: [sourcePath],
    descriptors: { [sourcePath]: descriptor },
    compileConfig: {
      minify: false,
      silent: true,
    },
    env: {}, // No environment variables loaded
    timing: null,
  };
}

export const runSingle = async (
  filePath: string,
  options: { root?: string; timing?: string }
) => {
  const rootDirAbs =
    options.root && isAbsolute(options.root) ? options.root : process.cwd();

  // Validate cron pattern
  invariant(
    options.timing,
    "Timing pattern is required. Use -t flag to provide a cron pattern"
  );
  invariant(
    validate(options.timing),
    `Invalid cron pattern: ${options.timing}`
  );

  const config = await getSingleTaskConfig(rootDirAbs, filePath);
  let scheduledTask: ScheduledTask | null = null;

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
      plugins: {},
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

    console.log(`Scheduling task: ${filePath}`);
    console.log(`Cron pattern: ${options.timing}`);

    const wrappedUserTask = async () => {
      try {
        await task.execute();
      } catch (error) {
        console.error(`Error executing task: ${filePath}`);
        console.error(error);
      }
    };

    // Schedule the task with the provided cron pattern
    scheduledTask = schedule(options.timing, wrappedUserTask);

    console.log(
      `Task scheduled successfully. Running on schedule: ${options.timing}`
    );
    console.log("Press Ctrl+C to stop...");
  } catch (error) {
    console.error("Error scheduling task.");
    console.error(error);
    process.exit(1);
  }

  handleSigInt(async () => {
    console.log("\nStopping scheduled task...");
    scheduledTask?.stop();
    process.exit(0);
  });
  handleSigTerm(async () => {
    console.log("\nStopping scheduled task...");
    scheduledTask?.stop();
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
};
