import { isAbsolute } from "node:path";
import invariant from "tiny-invariant";
import {
  handleSigInt,
  handleSigTerm,
  // FsDirWatcher,
  // absOrJoinWithRoot,
  // extractSourceDirsFromGlobs,
} from "@apisurf/ngn-os";
import {
  Compiler,
  TaskLibrary,
  TaskLibraryScheduler,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
  closeTaskDatabases,
} from "@apisurf/ngn-core";
import { getRunConfig } from "../config.js";
import { runLiveServer, LIVE_HOST } from "../liveServer.js";
import { runLiveTask } from "../util/runLiveTask.js";
import { describeDbPath } from "../util/dbPath.js";
import { VERSION } from "../version.js";

/**
 * What a run is, in five lines, at the moment it starts.
 *
 * The scheduler is headless now: the dashboard is a separate command against
 * the same file. That is only obvious if the run says so, so it prints the
 * exact `ngnui` invocation for this project — including `--live`, without
 * which the editor in that UI has nothing to execute against.
 *
 * `ngnui` is a paid module in its own repository, so the readout says so
 * rather than leaving someone to discover it at install time. `ngn sql`
 * covers the same data and ships here.
 */
function printReadout(dbPath: string, port: number) {
  const db = describeDbPath(dbPath);
  const live = `http://${LIVE_HOST}:${port}`;

  const lines = [``, `  ngn ${VERSION}`, ``, `  live       ${live}`];

  if (db.isMemory) {
    lines.push(
      `  database   :memory: — nothing is persisted, and there is nothing to browse`,
      ``,
      `  Set dbPath in ngn.config.ts to a file: URL to keep runs.`
    );
  } else {
    lines.push(
      `  database   ${db.absolute}`,
      ``,
      `  browse     ngnui --db ${db.absolute} --live ${live}`,
      `  query      ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20"`,
      ``,
      `  ngnui is a paid module; ngn sql ships with ngn.`
    );
  }

  console.log(`${lines.join("\n")}\n`);
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

export const run = async (options: { root?: string; match?: string }) => {
  const rootDirAbs =
    options.root && isAbsolute(options.root) ? options.root : process.cwd();

  const config = await getRunConfig(rootDirAbs, options.match);
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
    });

    scheduler.start();

    const port = config.configFileOptions.port;

    liveServer = await runLiveServer({
      port,
      version: VERSION,
      executeLiveTask: async (
        code: string,
        language: "typescript" | "javascript"
      ) => {
        return runLiveTask({
          root: rootDirAbs,
          filePath: `live-task-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 15)}.ts`,
          code: code,
          language: language,
        });
      },
    });

    printReadout(config.configFileOptions.dbPath, port);
  } catch (error) {
    console.error("Error while running.");
    console.error(error);
    closeTaskDatabases();
  }

  handleSigInt(async () => {
    await scheduler?.stop();
    liveServer?.close();
    closeTaskDatabases();
    process.exit(0);
  });
  handleSigTerm(async () => {
    await scheduler?.stop();
    liveServer?.close();
    closeTaskDatabases();
    process.exit(0);
  });
};
