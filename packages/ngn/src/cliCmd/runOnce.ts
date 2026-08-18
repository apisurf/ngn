import { isAbsolute } from "node:path";
import invariant from "tiny-invariant";
import { handleSigInt, handleSigTerm } from "@apisurf/ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
  closeTaskDatabases,
} from "@apisurf/ngn-core";
import { getRunConfig } from "../config.js";

export const runOnce = async (filePath: string, options: { root?: string }) => {
  const rootDirAbs =
    options.root && isAbsolute(options.root) ? options.root : process.cwd();

  const config = await getRunConfig(rootDirAbs, filePath); // filePath is the path of the task to run

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

    await task.execute();
  } catch (error) {
    console.error("Error running task.");
    console.error(error);
  } finally {
    closeTaskDatabases();
  }
};
