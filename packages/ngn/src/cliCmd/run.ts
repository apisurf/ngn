import { isAbsolute } from "node:path";
import invariant from "tiny-invariant";
import { runApi } from "ngn-api";
import {
  handleSigInt,
  handleSigTerm,
  // FsDirWatcher,
  // absOrJoinWithRoot,
  // extractSourceDirsFromGlobs,
} from "ngn-os";
import {
  Compiler,
  TaskLibrary,
  TaskLibraryScheduler,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
  PluginManager,
} from "ngn-core";
import { getRunConfig } from "../config";
import { runLiveTask } from "../util/runLiveTask";

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
  let apiServer: Awaited<ReturnType<typeof runApi>>;
  let scheduler: TaskLibraryScheduler;

  // Create plugin manager from config
  const pluginManager = new PluginManager({
    plugins: config.configFileOptions.plugins ?? [],
    initContext: {
      rootDir: config.rootDir,
      env: config.env,
    },
  });

  try {
    // Initialize plugins first (before DB and other services)
    await pluginManager.init();

    await setupDbClient(config.configFileOptions.dbPath);
    const dbClient = getDbClient();
    invariant(dbClient, "DB client not initialized");

    const compiler = new Compiler(config.compileConfig);
    // Compile tasks to in-memory strings instead of writing to disk
    const result = await compiler.compile(config.sourcePaths);
    const generateControlsFn = createControlsGenerator({
      dbClient,
      env: config.env,
      plugins: pluginManager.getPluginsApi(),
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

    apiServer = await runApi(
      {
        dbClient,
        port: 8787,
      },
      {
        coreControls: {
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
        },
      }
    );
  } catch (error) {
    console.error("Error while running.");
    console.error(error);
    // Cleanup plugins on error
    await pluginManager.destroy();
  }

  handleSigInt(async () => {
    await scheduler?.stop();
    apiServer?.close();
    await pluginManager.destroy();
    process.exit(0);
  });
  handleSigTerm(async () => {
    await scheduler?.stop();
    apiServer?.close();
    await pluginManager.destroy();
    process.exit(0);
  });
};
