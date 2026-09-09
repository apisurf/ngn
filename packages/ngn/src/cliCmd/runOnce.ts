import invariant from "tiny-invariant";
import { getCwd, handleSigInt, handleSigTerm } from "@apisurf/ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
  closeTaskDatabases,
} from "@apisurf/ngn-core";
import { getRunConfig } from "../config.js";

export const runOnce = async (pattern: string, options: { root?: string }) => {
  const rootDirAbs = getCwd(process.cwd(), options.root);

  const config = await getRunConfig(rootDirAbs, pattern);

  if (config.sourcePaths.length === 0) {
    console.error(
      `ngn: no task matched "${pattern}".\n` +
        "     The pattern is tested against the task path relative to root and must\n" +
        "     include the directory, e.g. tasks/scrape.ts. Only tasks covered by\n" +
        "     `match` in ngn.config.ts are candidates.",
    );
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

    await task.execute();
  } catch (error) {
    console.error(`ngn: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  } finally {
    closeTaskDatabases();
  }
};
