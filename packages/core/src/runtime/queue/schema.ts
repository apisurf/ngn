import type { Migration } from "../taskSqlite.js";

/**
 * The queue's table, created in whichever database the queue is opened on.
 *
 * Two timestamps that are easy to conflate are kept apart: `run_after` is the
 * earliest a job may be tried (a new job, or a retry backing off) and
 * `lease_until` is when a claim counts as abandoned, so a job held by a run
 * that died is claimable again. A NULL `key` opts out of de-duplication.
 */
export const QUEUE_MIGRATIONS: Migration[] = [
  {
    id: "ngn-queue-0001",
    up: `CREATE TABLE IF NOT EXISTS _ngn_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue TEXT NOT NULL,
      key TEXT,
      grp TEXT,
      payload TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ready',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL,
      run_after INTEGER NOT NULL,
      lease_until INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (queue, key)
    )`,
  },
  {
    id: "ngn-queue-0002",
    up: "CREATE INDEX IF NOT EXISTS _ngn_jobs_claim_idx ON _ngn_jobs (queue, status, run_after)",
  },
];

/** Where a job is in its life. `dead` and `done` are final until `reopen`. */
export type JobStatus = "ready" | "leased" | "done" | "dead" | "parked";

export interface JobRow {
  id: number;
  queue: string;
  key: string | null;
  grp: string | null;
  payload: string | null;
  priority: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: number;
  lease_until: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}
