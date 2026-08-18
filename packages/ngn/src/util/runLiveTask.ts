import { isAbsolute, join } from "node:path";
import invariant from "tiny-invariant";
import {
  handleSigInt,
  handleSigTerm,
  createFileDescriptor,
  readEnv,
} from "ngn-os";
import {
  Compiler,
  Task,
  createControlsGenerator,
  setupDbClient,
  getDbClient,
} from "ngn-core";
import { readConfig, findConfigFile } from "../config";
import { NGN_CONFIG_FILENAMES, DEFAULT_ENV_FILE } from "../constants";

export const runLiveTask = async (options: {
  root: string;
  filePath: string;
  code: string;
  language: "typescript" | "javascript";
}) => {
  const rootDirAbs =
    options.root && isAbsolute(options.root) ? options.root : process.cwd();

  handleSigInt(async () => {
    process.exit(0);
  });
  handleSigTerm(async () => {
    process.exit(0);
  });

  try {
    // Read config for db path and env file
    const configFilePath = findConfigFile(rootDirAbs);
    if (!configFilePath) {
      throw new Error(
        `Config file not found. Expected one of: ${NGN_CONFIG_FILENAMES.join(
          ", "
        )}`
      );
    }
    const config = await readConfig(configFilePath);

    await setupDbClient(config.dbPath);
    const dbClient = getDbClient();
    invariant(dbClient, "DB client not initialized");

    // Compile source code directly from memory
    const compiler = new Compiler({ minify: false, silent: true });
    const virtualPath = join(rootDirAbs, options.filePath);
    const compiledCode = await compiler.compileFromSource(
      options.code,
      virtualPath
    );

    // Create file descriptor for the virtual file
    const descriptor = createFileDescriptor({
      rootDir: rootDirAbs,
      path: options.filePath,
    });

    // Load environment variables
    const envFilePath = join(rootDirAbs, config.envFile ?? DEFAULT_ENV_FILE);
    const env = await readEnv(envFilePath);

    const generateControlsFn = createControlsGenerator({
      dbClient,
      env,
      plugins: {},
    });

    const task = new Task({
      buildConfigFn: generateControlsFn,
      entryParams: {
        compiledCode,
        descriptor,
        tasksRootDir: rootDirAbs,
      },
    });

    return task.execute();
  } catch (error) {
    console.error("Error running task.");
    console.error(error);
  }
};
