import { FsNodeFileDescriptor } from "ngn-os";

export type LiveSourceParams = {
  livePath: `live:${string}`;
  code: string;
};

export type DbSourceParams = {
  compiledCode: string;
  descriptor: FsNodeFileDescriptor;
};

export type EntryParams = LiveSourceParams | DbSourceParams;
/**
 * Base TaskContext without plugins (internal use)
 */
export interface BaseTaskContext {
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
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
}

/**
 * TaskContext with plugins namespace
 * @template TPlugins - Map of plugin name to plugin API
 */
export interface TaskContext<
  TPlugins extends Record<string, unknown> = Record<string, unknown>
> extends BaseTaskContext {
  plugins: TPlugins;
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
