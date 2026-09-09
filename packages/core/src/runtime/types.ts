import { TaskContext } from "../source/types.js";

export interface CompiledTaskCallbacks {
  onTaskLoadComplete?: ({
    paths,
    md5Hash,
    compiledCode,
  }: {
    paths: {
      compiled: string;
      source: string;
      relativeEntry: string;
      relativeParent: string;
    };
    md5Hash: string;
    compiledCode: string;
  }) => Promise<{
    fileTaskId: number;
    fileTaskVersionId: number;
  }>;

  onTaskExecutionStart?: () => Promise<void>;
  onTaskCodeLoaded?: () => Promise<void>;
  onTaskExportsLoaded?: () => Promise<void>;
}

export interface TaskRuntimeCallbacks {
  onNotFound?: (meta: { path: string }) => Promise<void>;
  onSkip?: (meta: { path: string }) => Promise<void>;
  onStart?: (meta: { path: string }) => Promise<void>;
  onSuccess?: (meta: { path: string }) => Promise<void>;
  onFailure?: (meta: { path: string }) => Promise<void>;
}

export type BuildCompiledTaskConfigFn = ({
  sourcePath,
  compiledPath,
}: {
  sourcePath: string;
  compiledPath: string;
}) => {
  compiledPath: string;
  sourcePath: string;
  taskCallbacks: CompiledTaskCallbacks;
  runtimeCallbacks: TaskRuntimeCallbacks;
  env: TaskContext["env"];
  kv: TaskContext["kv"];
  log: TaskContext["log"];
  timing: TaskContext["timing"];
  sqlite: TaskContext["sqlite"];
};
