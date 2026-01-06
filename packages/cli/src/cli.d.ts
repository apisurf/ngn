/**
 * Configuration options for op3
 */
export interface ConfigFileOptions {
  /** Database file path - use ":memory:" for in-memory or "file:path" for file-based */
  dbPath: ":memory:" | `file:${string}`;
  /** Port for the API server (default: 4545) */
  port: number;
  /** Glob patterns to match task files (default: ["tasks/&#42;&#42;/&#42;.ts"]) */
  match: string[];
  /** Path to the environment file (default: ".env") */
  envFile: string;
}

/**
 * Define configuration with type safety
 * @param config - Partial configuration options
 * @returns The configuration object
 */
export function defineConfig(
  config: Partial<ConfigFileOptions>
): Partial<ConfigFileOptions>;

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
