import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isDirectory, isFile, absOrJoinWithRoot, getCwd, stripAbsBasePath } from "@apisurf/ngn-os";
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
  const dbPathValue = options.dbPath === ":memory:" ? '":memory:"' : `"${options.dbPath}"`;

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
  normalizedOptions: ConfigFileOptions,
) => {
  const fileContents = generateConfigFileContents(normalizedOptions);
  const relative = stripAbsBasePath(absConfigFilePath, cwd);

  if (await isFile(absConfigFilePath)) {
    console.log(`exists  ${relative}`);
    return;
  }

  try {
    writeFileSync(absConfigFilePath, fileContents, "utf-8");
    console.log(`wrote   ${relative}`);
  } catch (error) {
    console.error(`ngn: cannot write ${relative}: ${message(error)}`);
    process.exitCode = 1;
  }
};

const createTasksDir = async (cwd: string) => {
  const tasksDir = join(cwd, DEFAULT_TASKS_DIR);
  const relative = stripAbsBasePath(tasksDir, cwd);

  try {
    if (await isDirectory(tasksDir)) {
      console.log(`exists  ${relative}/`);
      return;
    }

    await mkdir(tasksDir, { recursive: true });
    console.log(`created ${relative}/`);
  } catch (error) {
    console.error(`ngn: cannot create ${relative}/: ${message(error)}`);
    process.exitCode = 1;
  }
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `--dbFile ./ngn.db` used to fall through to `:memory:` because it lacked the
 * `file:` prefix the schema requires — the flag looked accepted and persisted
 * nothing. Add the prefix instead of discarding the value.
 */
function normalizeDbPath(dbFile: string | undefined): ConfigFileOptions["dbPath"] {
  if (!dbFile || dbFile === DEFAULT_DB_PATH) return DEFAULT_DB_PATH;
  return dbFile.startsWith("file:") ? (dbFile as `file:${string}`) : `file:${dbFile}`;
}

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
    dbPath: normalizeDbPath(options.dbFile),
    port: options.apiPort || DEFAULT_API_PORT,
    match: [options.match || DEFAULT_MATCH_PATTERN],
    envFile: options.envFile || DEFAULT_ENV_FILE,
  };

  await createConfigFile(absConfigFilePath, cwd, normalizedOptions);
  await createTasksDir(cwd);
  console.log("next: ngn add task.ts");
};
