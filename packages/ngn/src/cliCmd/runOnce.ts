import invariant from "tiny-invariant";
import { getCwd, handleSigInt, handleSigTerm } from "@apisurf/ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  runOnce as runThroughLease,
  setupDbClient,
  getDbClient,
  closeTaskDatabases,
  failedRunId,
  systemClock,
} from "@apisurf/ngn-core";
import { getRunConfig } from "../config.js";
import { describeAmbiguous, describeNoMatch } from "../util/matchTasks.js";
import { describeUnrecorded, printProblems, printScheduleProblem } from "../util/reportRun.js";

/**
 * `ngn run x --once`: one run now, recorded like any other. It goes through the
 * task's lease, so it never starts beside a run of the task in this process or
 * another; while one is going it says which, and exits 1 having written nothing.
 */

export const runOnce = async (pattern: string, options: { root?: string }) => {
  const rootDirAbs = getCwd(process.cwd(), options.root);

  const config = await getRunConfig(rootDirAbs, [pattern]);

  const [match] = config.taskMatches;
  if (match && match.paths.length !== 1) {
    console.error(match.paths.length === 0 ? describeNoMatch(match) : describeAmbiguous(match));
    process.exitCode = 1;
    return;
  }

  handleSigInt(async () => {
    process.exit(0);
  });
  handleSigTerm(async () => {
    process.exit(0);
  });

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
      // Run by hand and watched, so each problem comes with where in the task it was.
      report: printProblems({ frames: true }),
    });

    const [first] = [...result.compiled.entries()];
    invariant(first, `Nothing compiled for ${config.sourcePaths[0]}`);
    const [sourcePath, compiledCode] = first;
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

    const outcome = await runThroughLease(task, {
      clock: systemClock,
      onProblem: (message) => printScheduleProblem(task.taskPath, message),
    });
    if ("busy" in outcome) {
      console.error(`ngn: ${outcome.busy}`);
      process.exitCode = 1;
      return;
    }
    if (outcome.status === "failure") throw outcome.error;
  } catch (error) {
    // A recorded failure was printed as it was recorded.
    if (failedRunId(error) == null) {
      console.error(describeUnrecorded(match?.paths[0] ?? pattern, error));
    }
    process.exitCode = 1;
  } finally {
    closeTaskDatabases();
  }
};
