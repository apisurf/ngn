import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  readEnv as readEnvFile,
  createFileDescriptor,
  readFileAsUtf8,
  FsNodeFileDescriptor,
} from "op3-os";
import { ConfigFileOptions, CliOptions } from "./types";
import {
  OP3_CONFIG_FILENAME,
  DEFAULT_ENV_FILENAME,
  SCHEMA_URL,
  DEFAULT_DB_PATH,
  DEFAULT_API_PORT,
  DEFAULT_MATCH_PATTERN,
  DEFAULT_ENV_FILE,
} from "./constants";
import { glob } from "glob";
import outmatch from "outmatch";

const defaults: ConfigFileOptions = {
  $schema: SCHEMA_URL,
  dbPath: DEFAULT_DB_PATH,
  port: DEFAULT_API_PORT,
  match: [DEFAULT_MATCH_PATTERN],
  envFile: DEFAULT_ENV_FILE,
};

function normalizeConfig(
  configObj: Exclude<ConfigFileOptions, "$schema">
): ConfigFileOptions {
  return {
    $schema: configObj.$schema ?? defaults.$schema,
    dbPath: configObj.dbPath ?? defaults.dbPath,
    port: configObj.port ?? defaults.port,
    match: configObj.match ?? defaults.match,
    envFile: configObj.envFile ?? defaults.envFile,
  };
}

export async function readConfig(path: string): Promise<ConfigFileOptions> {
  const cwdConfigContents = await readFileAsUtf8(path);
  const parsedConfig = JSON.parse(cwdConfigContents ?? "{}"); // safe parse
  return normalizeConfig(parsedConfig);
}

export async function getRunConfig(
  rootDir: string,
  filePathMatch?: string
): Promise<CliOptions> {
  const configFilePath = join(rootDir, OP3_CONFIG_FILENAME);

  if (!existsSync(configFilePath)) {
    console.error(
      `\nConfig file not found: ${configFilePath}\n\nRun \`op3 init\` to generate a config file.\n`
    );
    process.exit(1);
  }

  const configuration = (await readConfig(configFilePath)) as ConfigFileOptions;
  const entryFiles = await glob(configuration.match, {
    cwd: rootDir,
    ignore: ["**/node_modules/**", "**/.git/**", "**/_*", "**/_*/**"],
  });

  const filteredEntryFiles = filePathMatch
    ? entryFiles.filter(outmatch(filePathMatch, { flags: "i" })) // case insensitive matching by user provided pattern
    : entryFiles;

  const envFileAbsPath = join(rootDir, configuration.envFile);
  const fileDescriptors = filteredEntryFiles.map((file) =>
    createFileDescriptor({ rootDir, path: file })
  );

  // Build sourcePaths and descriptors keyed by source path
  const sourcePaths: string[] = [];
  const descriptors: Record<string, FsNodeFileDescriptor> = {};

  fileDescriptors.forEach((descriptor) => {
    sourcePaths.push(descriptor.path.absolute);
    descriptors[descriptor.path.absolute] = descriptor;
  });

  return {
    rootDir: rootDir,
    configFileOptions: configuration,
    sourcePaths,
    descriptors,
    compileConfig: {
      minify: false,
      silent: true,
    },
    env: await readEnvFile(envFileAbsPath),
    timing: null, // default to no override(read from task files)
  };
}

export async function readEnv(path?: string) {
  const normalizedPath = path ?? DEFAULT_ENV_FILENAME;

  return isAbsolute(normalizedPath)
    ? readEnvFile(normalizedPath)
    : readEnvFile(join(process.cwd(), normalizedPath));
}
