import invariant from "tiny-invariant";
import {
  getCwd,
  // FsDirWatcher,
  // absOrJoinWithRoot,
  // extractSourceDirsFromGlobs,
} from "@apisurf/ngn-os";
import { describeTiming, type TimingValue } from "@apisurf/ngn-schema/describe";
import {
  Compiler,
  type ScheduleReport,
  TaskLibrary,
  TaskLibraryScheduler,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
  closeTaskDatabases,
  failedRunId,
} from "@apisurf/ngn-core";
import { getRunConfig } from "../config.js";
import { runLiveServer, LIVE_HOST } from "../liveServer.js";
import { runLiveTask } from "../util/runLiveTask.js";
import { describeUnrecorded, printProblems, printScheduleProblem } from "../util/reportRun.js";
import { onStopSignal } from "../util/stopSignal.js";
import { describeDbPath } from "../util/dbPath.js";
import { describeNoMatch } from "../util/matchTasks.js";
import { VERSION } from "../version.js";

/**
 * What a run is, at the moment it starts: which tasks it scheduled and when
 * they run, in the same words ngnui uses, and where it records them. The
 * scheduler is headless, so the readout also prints how to look.
 */
function printReadout(dbPath: string, port: number, report: ScheduleReport, match: string[]) {
  const db = describeDbPath(dbPath);
  const live = `http://${LIVE_HOST}:${port}`;

  const lines = [
    ``,
    `  ngn ${VERSION}`,
    ``,
    ...taskLines(report, match),
    ``,
    `  runtime    ${live}`,
  ];

  if (db.isMemory) {
    lines.push(`  database   :memory: (not persisted — set dbPath to a file: URL to keep runs)`);
  } else {
    lines.push(
      `  database   ${db.absolute}`,
      ``,
      `  browse     ngn ui`,
      `  query      ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20"`,
    );
  }

  console.log(`${lines.join("\n")}\n`);
}

/** One line per task: what it runs on, or why it is not running at all. */
function taskLines(report: ScheduleReport, match: string[]): string[] {
  const rows = [
    ...report.scheduled.map(
      (t) => [t.path, describeTiming(t.timing as TimingValue) ?? String(t.timing)] as const,
    ),
    ...report.failed.map((t) => [t.path, `not scheduled: ${t.reason}`] as const),
  ];
  if (rows.length === 0) {
    return [
      `  tasks      none — \`match\` in ngn.config.ts (${match.join(", ")}) finds no task files`,
    ];
  }
  const width = Math.max(...rows.map(([path]) => path.length));
  return rows.map(
    ([path, when], i) => `  ${i === 0 ? "tasks    " : "         "}  ${path.padEnd(width)}  ${when}`,
  );
}

// async function watchSourceDirectories(
//   matchPatterns: string[],
//   rootDir: string
// ): Promise<void> {
//   const sourceDirs = extractSourceDirsFromGlobs(matchPatterns);
//   const watchPromises = sourceDirs.map(async (dir) => {
//     const watchDir = absOrJoinWithRoot(dir, rootDir);
//     const fsWatcher = new FsDirWatcher({
//       dirPath: watchDir,
//       extensions: [".ts", ".js"],
//       onAdd: (path) => console.log(`File added: ${path}`),
//       onUnlink: (path) => console.log(`File removed: ${path}`),
//       onChange: (path) => console.log(`File changed: ${path}`),
//     });

//     return fsWatcher.watch();
//   });

//   await Promise.all(watchPromises);
// }

export const run = async (options: { root?: string; tasks?: string[] }) => {
  const rootDirAbs = getCwd(process.cwd(), options.root);

  const config = await getRunConfig(rootDirAbs, options.tasks);
  // Scheduling nothing because a name was mistyped would look like success.
  const unmatched = config.taskMatches.filter((match) => match.paths.length === 0);
  if (unmatched.length) {
    for (const match of unmatched) console.error(describeNoMatch(match));
    process.exit(1);
  }
  const taskLibrary = new TaskLibrary();
  let liveServer: Awaited<ReturnType<typeof runLiveServer>>;
  let scheduler: TaskLibraryScheduler;

  try {
    await setupDbClient(config.configFileOptions.dbPath);
    const dbClient = getDbClient();
    invariant(dbClient, "DB client not initialized");

    const compiler = new Compiler(config.compileConfig);
    // Compile tasks to in-memory strings instead of writing to disk
    const result = await compiler.compile(config.sourcePaths);
    const generateControlsFn = createControlsGenerator({
      dbClient,
      env: config.env,
      // One line per problem as each run records it, pointing at `ngn show`.
      report: printProblems(),
    });

    // Add tasks from in-memory compiled code
    taskLibrary.addFromCompiledCode({
      compiledCode: result.compiled,
      descriptors: config.descriptors,
      tasksRootDir: config.rootDir,
      buildConfigFn: generateControlsFn,
    });

    // await watchSourceDirectories(
    //   config.configFileOptions.match,
    //   config.rootDir
    // );

    scheduler = new TaskLibraryScheduler({
      taskLibrary,
      // A run that recorded its error has already been printed by `report`;
      // what is left threw before there was a run to record it on.
      onRunError: (path, error) => {
        if (failedRunId(error) == null) console.error(describeUnrecorded(path, error));
      },
      onScheduleProblem: printScheduleProblem,
    });

    const report = await scheduler.start();

    const port = config.configFileOptions.port;

    liveServer = await runLiveServer({
      port,
      version: VERSION,
      db: describeDbPath(config.configFileOptions.dbPath).absolute,
      executeLiveTask: async (code: string, language: "typescript" | "javascript") => {
        return runLiveTask({
          root: rootDirAbs,
          filePath: `live-task-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.ts`,
          code: code,
          language: language,
        });
      },
      runTaskNow: (path) => scheduler.runNow(path),
      controlTask: (path, command) => scheduler.control(path, command),
    });

    printReadout(config.configFileOptions.dbPath, port, report, config.configFileOptions.match);
  } catch (error) {
    console.error(`ngn: run failed: ${error instanceof Error ? error.stack : String(error)}`);
    closeTaskDatabases();
    process.exit(1);
  }

  onStopSignal(async () => {
    liveServer?.close();
    await scheduler?.stop();
    closeTaskDatabases();
  });
};
