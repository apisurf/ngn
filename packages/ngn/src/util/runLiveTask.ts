import { isAbsolute, join } from "node:path";
import invariant from "tiny-invariant";
import { createFileDescriptor, readEnv } from "@apisurf/ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
  releaseTaskDatabases,
  runFailure,
} from "@apisurf/ngn-core";
import { errorSummary } from "@apisurf/ngn-schema/describe";
import { readConfig, findConfigFile } from "../config.js";
import { NGN_CONFIG_FILENAMES, DEFAULT_ENV_FILE } from "../constants.js";
import { describeUnrecorded, printProblems } from "./reportRun.js";

/** What an editor run came to: what it returned, or what it threw and where. */
export type LiveTaskOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: string; stage: string | null; runId: number | null };

/**
 * Run code from the editor once, inside the `ngn run` process that serves it,
 * recorded like any other run.
 *
 * It shares that process with the scheduler, so it leaves the process as it
 * found it: no signal handlers of its own (the scheduler's close everything on
 * exit), and only its own databases closed afterwards. Closing them all would
 * cut off scheduled runs still using theirs.
 */
export const runLiveTask = async (options: {
  root: string;
  filePath: string;
  code: string;
  language: "typescript" | "javascript";
}): Promise<LiveTaskOutcome> => {
  const rootDirAbs = options.root && isAbsolute(options.root) ? options.root : process.cwd();
  let task: Task | null = null;

  try {
    // Read config for db path and env file
    const configFilePath = findConfigFile(rootDirAbs);
    if (!configFilePath) {
      throw new Error(`Config file not found. Expected one of: ${NGN_CONFIG_FILENAMES.join(", ")}`);
    }
    const config = await readConfig(configFilePath);

    await setupDbClient(config.dbPath);
    const dbClient = getDbClient();
    invariant(dbClient, "DB client not initialized");

    // Compile source code directly from memory
    const compiler = new Compiler({ minify: false, silent: true });
    const virtualPath = join(rootDirAbs, options.filePath);
    const compiledCode = await compiler.compileFromSource(options.code, virtualPath);

    // Create file descriptor for the virtual file
    const descriptor = createFileDescriptor({
      rootDir: rootDirAbs,
      path: options.filePath,
    });

    const env = await readEnv(join(rootDirAbs, config.envFile ?? DEFAULT_ENV_FILE));

    const generateControlsFn = createControlsGenerator({
      dbClient,
      env,
      // Someone is watching an editor run, so its problems come with their frames.
      report: printProblems({ frames: true }),
    });

    task = new Task({
      buildConfigFn: generateControlsFn,
      entryParams: {
        compiledCode,
        descriptor,
        tasksRootDir: rootDirAbs,
      },
    });

    return { ok: true, result: await task.execute() };
  } catch (error) {
    const recorded = runFailure(error);
    if (!recorded) console.error(describeUnrecorded(options.filePath, error));
    return {
      ok: false,
      error: errorSummary(error),
      stage: recorded?.stage ?? null,
      runId: recorded?.runId ?? null,
    };
  } finally {
    // A live task is a one-off with a filename that is never reused, so any
    // database it opened has no second run to be held open for.
    if (task) releaseTaskDatabases(task.sourcePath);
  }
};
