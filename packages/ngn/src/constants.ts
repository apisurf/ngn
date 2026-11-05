export const NGN_CONFIG_FILENAME_TS = "ngn.config.ts";
export const NGN_CONFIG_FILENAME_JS = "ngn.config.js";
export const NGN_CONFIG_FILENAMES = [NGN_CONFIG_FILENAME_TS, NGN_CONFIG_FILENAME_JS];
export const DEFAULT_ENV_FILENAME = ".env";

// Default config values
export const DEFAULT_DB_PATH = ":memory:";
/** What `ngn init` writes: a file, so the run history is there to read from the first run. */
export const DEFAULT_INIT_DB_PATH = "file:./ngn.sqlite";
export const DEFAULT_API_PORT = 4545;
export const DEFAULT_ENV_FILE = ".env";
export const DEFAULT_TASKS_DIR = "tasks";
export const DEFAULT_MATCH_PATTERN = `${DEFAULT_TASKS_DIR}/**/*.ts`;
