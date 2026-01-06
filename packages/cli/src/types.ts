import { FsNodeFileDescriptor } from "op3-os";
import { readEnv } from "./config";
import type { ConfigFileOptions } from "./configSchema";

export type { ConfigFileOptions };

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
