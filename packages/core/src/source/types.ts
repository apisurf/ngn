import { FsNodeFileDescriptor } from "@apisurf/ngn-os";
import { TaskSqlite } from "../runtime/taskSqlite.js";

export type LiveSourceParams = {
  livePath: `live:${string}`;
  code: string;
};

export type DbSourceParams = {
  compiledCode: string;
  descriptor: FsNodeFileDescriptor;
  tasksRootDir: string;
};

export type EntryParams = LiveSourceParams | DbSourceParams;

/**
 * The single argument every task export receives.
 */
export interface TaskContext {
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
    file: FsNodeFileDescriptor;
    tasksRootDir: string;
  };
  env: Record<string, string> | null;
  kv: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
  };
  log: {
    info(value: string): Promise<void>;
    error(value: string): Promise<void>;
    warning(value: string): Promise<void>;
  };
  timing: {
    start(label: string): () => Promise<void>;
  };
  /**
   * SQLite scoped to the folder this task file lives in. Always present — no
   * configuration required.
   */
  sqlite: TaskSqlite;
}

export interface EntryExports {
  timing?: string;
  task: (deps: TaskContext) => Promise<void>;
  shouldSkip?: (deps: TaskContext) => Promise<boolean>;
  shouldRetry?: (deps: TaskContext) => Promise<boolean>;
  onSuccess?: (deps: TaskContext) => Promise<void>;
  onError?: (err: Error, deps: TaskContext) => Promise<void>;
  onComplete?: (deps: TaskContext) => Promise<void>;
}

export interface OnTaskCodeLoaded {
  (md5Hash: string): Promise<void>;
}
