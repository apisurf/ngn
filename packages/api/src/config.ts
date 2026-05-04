import { DbPath } from "ngn-persistence";
import { join, isAbsolute } from "path";
import { Options, ApiConfig } from "./types.js";

export function getConfig(conf: Options): ApiConfig {
  if ("dbPath" in conf) {
    const normalizedDbPath: DbPath =
      conf.dbPath === ":memory:"
        ? ":memory:"
        : isAbsolute(conf.dbPath)
        ? `file:${conf.dbPath}`
        : `file:${join(process.cwd(), conf.dbPath)}`;

    return {
      dbPath: normalizedDbPath,
      port: conf.port,
      staticFilesPath: join(process.cwd(), "public"),
    };
  }

  return {
    dbClient: conf.dbClient,
    port: conf.port,
    staticFilesPath: join(process.cwd(), "public"),
  };
}
