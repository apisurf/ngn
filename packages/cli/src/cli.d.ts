/**
 * Context object provided to task functions
 */
export interface TaskContext {
  /** Metadata about the task execution */
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
  };
  /** Environment variables passed to the task */
  env: Record<string, string> | null;
  /** Key-value store for task */
  kv: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
  };
  /** Logging functions for task */
  log: {
    info(value: string): Promise<void>;
    error(value: string): Promise<void>;
    warning(value: string): Promise<void>;
  };
  /** Timing functions for task */
  timing: {
    start(label: string): () => Promise<void>;
  };
}
