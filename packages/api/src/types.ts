import { Client, DbPath } from "op3-persistence";

export type Options =
  | {
      dbPath: string;
      port: number;
      staticFilesPath?: string;
    }
  | {
      dbClient: Client;
      port: number;
      staticFilesPath?: string;
    };

export type ApiConfig =
  | {
      dbPath: DbPath;
      port: number;
      staticFilesPath?: string;
    }
  | {
      dbClient: Client;
      port: number;
      staticFilesPath?: string;
    };

export type CoreControls = {
  executeLiveTask: (
    code: string,
    language: "typescript" | "javascript"
  ) => Promise<unknown>;
};
