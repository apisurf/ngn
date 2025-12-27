import { FsNodeFileDescriptor } from "op3-os";
import { readEnv } from "./config";

export interface ConfigFileOptions {
  $schema: string; // version of the config schema
  dbPath: ":memory:" | `file:${string}`; // database file path
  port: number; // port for the API server; 4545 by default
  match: Array<string>; // glob patterns to match task files; ["tasks/**/*.ts"] by default
  envFile: string; // path to the environment file; ".env" by default
}

export interface CliOptions {
  rootDir: string;
  configFileOptions: ConfigFileOptions; // options from the config file
  sourcePaths: string[]; // array of source file paths to compile
  descriptors: Record<string, FsNodeFileDescriptor>; // map of source paths to their file descriptors
  compileConfig: {
    minify: boolean; // whether to minify the compiled tasks
    silent: boolean; // whether to suppress output during compilation
  };
  env: Awaited<ReturnType<typeof readEnv>>;
  timing: string | null; // cron pattern for scheduling tasks
}
