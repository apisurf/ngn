import { randomUUID } from "node:crypto";
import { Client } from "@apisurf/ngn-persistence";

/**
 * Named leases in `locks`.
 *
 * Taking one is a single upsert that only overwrites a row whose lease has
 * run out, so two processes on one file cannot both win, and a lease left by
 * a process that died is free once it expires. Every acquisition gets its own
 * holder token: two runs of one task in one process are two holders.
 */
export class LockService {
  constructor(private db: Client) {}

  /** The holder token on success, null when someone else holds an unexpired lease. */
  async tryAcquire(name: string, ttlMs: number, taskRunId: number | null): Promise<string | null> {
    const holder = `${process.pid}:${randomUUID()}`;
    const now = Date.now();
    const { rows } = await this.db.execute({
      sql: `INSERT INTO locks (name, holder, task_run_id, acquired_at, expires_at)
            VALUES (:name, :holder, :taskRunId, :now, :expiresAt)
            ON CONFLICT(name) DO UPDATE SET
              holder = excluded.holder,
              task_run_id = excluded.task_run_id,
              acquired_at = excluded.acquired_at,
              expires_at = excluded.expires_at
            WHERE locks.expires_at <= excluded.acquired_at
            RETURNING holder`,
      args: { name, holder, taskRunId, now, expiresAt: now + ttlMs },
    });

    return rows.length ? holder : null;
  }

  /** Push the lease out; false when it was lost (it expired and someone took it). */
  async renew(name: string, holder: string, ttlMs: number): Promise<boolean> {
    const { rowsAffected } = await this.db.execute({
      sql: "UPDATE locks SET expires_at = :expiresAt WHERE name = :name AND holder = :holder",
      args: { name, holder, expiresAt: Date.now() + ttlMs },
    });

    return rowsAffected > 0;
  }

  async release(name: string, holder: string) {
    await this.db.execute({
      sql: "DELETE FROM locks WHERE name = :name AND holder = :holder",
      args: { name, holder },
    });
  }
}
