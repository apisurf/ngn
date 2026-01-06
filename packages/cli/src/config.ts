import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  readEnv as readEnvFile,
  createFileDescriptor,
  FsNodeFileDescriptor,
} from "op3-os";
import { Compiler } from "op3-core";
import { ZodError } from "zod";
import { configSchema, ConfigFileOptions } from "./configSchema";
import { CliOptions } from "./types";
import {
  OP3_CONFIG_FILENAMES,
  DEFAULT_ENV_FILENAME,
  DEFAULT_DB_PATH,
  DEFAULT_API_PORT,
  DEFAULT_MATCH_PATTERN,
  DEFAULT_ENV_FILE,
} from "./constants";
import { glob } from "glob";
import outmatch from "outmatch";

const defaults: ConfigFileOptions = {
  dbPath: DEFAULT_DB_PATH,
  port: DEFAULT_API_PORT,
  match: [DEFAULT_MATCH_PATTERN],
  envFile: DEFAULT_ENV_FILE,
};

function findConfigFile(rootDir: string): string | null {
  for (const filename of OP3_CONFIG_FILENAMES) {
    const configPath = join(rootDir, filename);
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

async function loadConfigFile(configPath: string): Promise<ConfigFileOptions> {
  const compiler = new Compiler({ silent: true });
  const { compiled } = await compiler.compile([configPath]);
  const code = compiled.get(configPath);

  if (!code) {
    throw new Error(`Failed to compile config file: ${configPath}`);
  }

  // Execute compiled code to get default export
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const fn = new Function("module", "exports", code);
  fn(moduleObj, moduleObj.exports);

  const rawConfig = moduleObj.exports.default ?? moduleObj.exports;

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Config validation failed:\n${issues}`);
    }
    throw error;
  }
}

function normalizeConfig(
  configObj: Partial<ConfigFileOptions>
): ConfigFileOptions {
  return {
    dbPath: configObj.dbPath ?? defaults.dbPath,
    port: configObj.port ?? defaults.port,
    match: configObj.match ?? defaults.match,
    envFile: configObj.envFile ?? defaults.envFile,
  };
}

export async function readConfig(path: string): Promise<ConfigFileOptions> {
  const config = await loadConfigFile(path);
  return normalizeConfig(config);
}

export async function getRunConfig(
  rootDir: string,
  filePathMatch?: string
): Promise<CliOptions> {
  const configFilePath = findConfigFile(rootDir);

  if (!configFilePath) {
    console.error(
      `\nConfig file not found in: ${rootDir}\n\nExpected one of: ${OP3_CONFIG_FILENAMES.join(", ")}\n\nRun \`op3 init\` to generate a config file.\n`
    );
    process.exit(1);
  }

  const configuration = await readConfig(configFilePath);
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
