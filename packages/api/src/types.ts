import { Client, DbPath } from "ngn-persistence";

export type Options =
  | {
      dbPath: string;
      port: number;
    }
  | {
      dbClient: Client;
      port: number;
    };

export type ApiConfig =
  | {
      dbPath: DbPath;
      port: number;
    }
  | {
      dbClient: Client;
      port: number;
    };

export type CoreControls = {
  executeLiveTask: (
    code: string,
    language: "typescript" | "javascript"
  ) => Promise<unknown>;
};
