import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  isDirectory,
  isFile,
  absOrJoinWithRoot,
  getCwd,
  stripAbsBasePath,
} from "@apisurf/ngn-os";
import { writeFileSync } from "node:fs";
import type { ConfigFileOptions } from "../configSchema.js";
import {
  DEFAULT_DB_PATH,
  DEFAULT_API_PORT,
  DEFAULT_ENV_FILE,
  DEFAULT_TASKS_DIR,
  DEFAULT_MATCH_PATTERN,
  NGN_CONFIG_FILENAME_TS,
} from "../constants.js";

const generateConfigFileContents = (options: ConfigFileOptions): string => {
  const dbPathValue =
    options.dbPath === ":memory:" ? '":memory:"' : `"${options.dbPath}"`;

  return `import { defineConfig } from "@apisurf/ngn";

export default defineConfig({
  dbPath: ${dbPathValue},
  port: ${options.port},
  match: ${JSON.stringify(options.match)},
  envFile: "${options.envFile}",
});
`;
};

const createConfigFile = async (
  absConfigFilePath: string,
  cwd: string,
  normalizedOptions: ConfigFileOptions
) => {
  const fileContents = generateConfigFileContents(normalizedOptions);

  if (await isFile(absConfigFilePath)) {
    console.log(
      `Config file already exists at ${stripAbsBasePath(
        absConfigFilePath,
        cwd
      )}. Skipping...`
    );
    return;
  }

  try {
    writeFileSync(absConfigFilePath, fileContents, "utf-8");
  } catch (error) {
    console.error("Error writing to config file.");
    console.error(error);
  }
};

const createTasksDir = async (cwd: string) => {
  const tasksDir = join(cwd, DEFAULT_TASKS_DIR);

  try {
    const dirExists = await isDirectory(tasksDir);

    if (dirExists) {
      console.log(
        `Tasks directory already exists at ${stripAbsBasePath(
          tasksDir,
          cwd
        )}. Skipping...`
      );
      return;
    }

    await mkdir(tasksDir, { recursive: true });
  } catch (error) {
    console.error("Error creating tasks directory");
    console.error(error);
  }
};

export const init = async (options: {
  root?: string;
  configFile?: string;
  dbFile?: string;
  apiPort?: number;
  match?: string;
  envFile?: string;
}) => {
  const cwd = getCwd(process.cwd(), options.root || process.cwd());
  const configFilePath = options.configFile || NGN_CONFIG_FILENAME_TS;
  const absConfigFilePath = absOrJoinWithRoot(configFilePath, cwd);
  const normalizedOptions: ConfigFileOptions = {
    dbPath: options.dbFile?.startsWith("file:")
      ? (options.dbFile as `file:${string}`)
      : DEFAULT_DB_PATH,
    port: options.apiPort || DEFAULT_API_PORT,
    match: [options.match || DEFAULT_MATCH_PATTERN],
    envFile: options.envFile || DEFAULT_ENV_FILE,
  };

  await createConfigFile(absConfigFilePath, cwd, normalizedOptions);
  await createTasksDir(cwd);
  console.log(`Initialized!\n\nRun 'ngn add task.ts' to add your first task.`);
};
