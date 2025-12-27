/**
 * Context object provided to task functions
 */
export interface EntryContext {
  /** Environment variables passed to the task */
  env: Record<string, string> | null;
  /** Metadata about the task execution */
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
  };
  /** Utility functions for task execution */
  $: {
    /** Store a key-value pair in persistent storage */
    setItem(key: string, value: string): Promise<void>;
    /** Retrieve a value from persistent storage */
    getItem(key: string): Promise<string | null>;
    /** Delete a key from persistent storage */
    deleteItem(key: string): Promise<void>;
    /** Log an info message */
    logInfo(value: string): Promise<void>;
    /** Log an error message */
    logError(value: string): Promise<void>;
    /** Log a warning message */
    logWarning(value: string): Promise<void>;
    /** Start a timer with a label and return a function to stop it */
    startTimer(label: string): () => Promise<void>;
  };
}
