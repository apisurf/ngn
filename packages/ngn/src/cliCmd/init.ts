import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isDirectory, isFile, absOrJoinWithRoot, getCwd, stripAbsBasePath } from "@apisurf/ngn-os";
import { writeFileSync } from "node:fs";
import type { ConfigFileOptions } from "../configSchema.js";
import {
  DEFAULT_DB_PATH,
  DEFAULT_INIT_DB_PATH,
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
 * No flag means a file, so `ngn sql` and ngnui have something to read after the
 * first run; `:memory:` is there for whoever asks for it.
 *
 * `--db ./ngn.db` used to fall through to `:memory:` because it lacked the
 * `file:` prefix the schema requires — the flag looked accepted and persisted
 * nothing. Add the prefix instead of discarding the value.
 */
function normalizeDbPath(db: string | undefined): ConfigFileOptions["dbPath"] {
  if (!db) return DEFAULT_INIT_DB_PATH;
  if (db === DEFAULT_DB_PATH) return DEFAULT_DB_PATH;
  return db.startsWith("file:") ? (db as `file:${string}`) : `file:${db}`;
}

/** The flags `ngn init` takes, under their current names and the ones they had before. */
export interface InitFlags {
  root?: string;
  db?: string;
  port?: string;
  match?: string;
  config?: string;
  envFile?: string;
  /** Before `--db`. */
  dbFile?: string;
  /** Before `--port`. */
  apiPort?: string;
  /** Before `--config`. */
  configFile?: string;
}

/**
 * The config `ngn init` writes, and where, from its flags. A current name wins
 * over an old one given alongside it. Null (after reporting) for a bad port.
 */
export function initOptions(
  flags: InitFlags,
): { configFile: string; options: ConfigFileOptions } | null {
  const rawPort = flags.port ?? flags.apiPort;
  const port = rawPort === undefined ? DEFAULT_API_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`ngn: --port expects a number between 1 and 65535 (got "${rawPort}")`);
    return null;
  }
  return {
    configFile: flags.config ?? flags.configFile ?? NGN_CONFIG_FILENAME_TS,
    options: {
      dbPath: normalizeDbPath(flags.db ?? flags.dbFile),
      port,
      match: [flags.match || DEFAULT_MATCH_PATTERN],
      envFile: flags.envFile || DEFAULT_ENV_FILE,
    },
  };
}

export const init = async (flags: InitFlags) => {
  const resolved = initOptions(flags);
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  const cwd = getCwd(process.cwd(), flags.root || process.cwd());
  const absConfigFilePath = absOrJoinWithRoot(resolved.configFile, cwd);
  await createConfigFile(absConfigFilePath, cwd, resolved.options);
  await createTasksDir(cwd);
  console.log("next: ngn add task.ts");
};
