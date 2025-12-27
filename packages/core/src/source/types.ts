import { FsNodeFileDescriptor } from "op3-os";

export type LiveSourceParams = {
  livePath: `live:${string}`;
  code: string;
};

export type DbSourceParams = {
  compiledCode: string;
  descriptor: FsNodeFileDescriptor;
};

export type EntryParams = LiveSourceParams | DbSourceParams;

export interface EntryContext {
  env: Record<string, string> | null;
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
  };
  $: {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    deleteItem(key: string): Promise<void>;
    logInfo(value: string): Promise<void>;
    logError(value: string): Promise<void>;
    logWarning(value: string): Promise<void>;
    startTimer(label: string): () => Promise<void>;
  };
}

export interface EntryExports {
  timing?: string;
  task: (deps: EntryContext) => Promise<void>;
  shouldSkip?: (deps: EntryContext) => Promise<boolean>;
  shouldRetry?: (deps: EntryContext) => Promise<boolean>;
  onSuccess?: (deps: EntryContext) => Promise<void>;
  onError?: (err: Error, deps: EntryContext) => Promise<void>;
  onComplete?: (deps: EntryContext) => Promise<void>;
}

export interface OnTaskCodeLoaded {
  (md5Hash: string): Promise<void>;
}
