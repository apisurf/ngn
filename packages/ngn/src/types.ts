import { FsNodeFileDescriptor } from "@apisurf/ngn-os";
import { readEnv } from "./config.js";
import type { ConfigFileOptions } from "./configSchema.js";
import type { TaskMatch } from "./util/matchTasks.js";

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
  taskMatches: TaskMatch[]; // how each task name on the command line resolved
}
