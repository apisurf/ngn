import { Client } from "@apisurf/ngn-persistence";
import z from "zod";
import { $taskRun } from "@apisurf/ngn-schema";

type TaskRun = z.infer<typeof $taskRun>;

/**
 * A task's return value as it is stored: JSON, or NULL for nothing.
 *
 * Whatever the task returned has already happened, so a value JSON cannot
 * carry (a cycle, a BigInt) is stored as its string form rather than turning
 * a successful run into a failed one.
 */
export function serializeResult(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    try {
      return String(value);
    } catch {
      return null;
    }
  }
}

export class TaskRunService {
  constructor(private db: Client) {}

  async initTaskRun(data: {
    file_task_id: number;
    file_task_version_id: number;
    retry_of?: number | null;
  }) {
    const { rows } = await this.db.execute({
      sql: "INSERT INTO task_runs (file_task_id, file_task_version_id, status, retry_of) VALUES (:file_task_id, :file_task_version_id, 'pending', :retry_of) RETURNING id",
      args: {
        file_task_id: data.file_task_id,
        file_task_version_id: data.file_task_version_id,
        retry_of: data.retry_of ?? null,
      },
    });

    return rows[0].id as number;
  }

  async skipTaskRun(taskRunId: number, reason: string | null = null) {
    await this.db.execute({
      sql: "UPDATE task_runs SET status = 'skipped', ended_at = :ended_at, skip_reason = :reason WHERE id = :id",
      args: { id: taskRunId, ended_at: Date.now(), reason },
    });
  }

  /**
   * How the task's latest ticks ended, newest first: `failure` or `success`
   * per tick, a tick's retries folded into it (its last attempt decides).
   * Skipped ticks are left out; they neither break nor extend a streak.
   */
  async recentTickOutcomes(fileTaskId: number, limit: number) {
    const { rows } = await this.db.execute({
      sql: `SELECT r.id,
                   COALESCE(
                     (SELECT a.status FROM task_runs a WHERE a.retry_of = r.id ORDER BY a.id DESC LIMIT 1),
                     r.status
                   ) AS outcome
            FROM task_runs r
            WHERE r.file_task_id = :fileTaskId AND r.retry_of IS NULL
              AND r.status IN ('success', 'failure')
            ORDER BY r.id DESC LIMIT :limit`,
      args: { fileTaskId, limit },
    });
    return rows as unknown as Array<{ id: number; outcome: "success" | "failure" }>;
  }

  /** Runs skipped with `reason` after run `afterId`. */
  async countSkipsSince(fileTaskId: number, reason: string, afterId: number) {
    const { rows } = await this.db.execute({
      sql: `SELECT COUNT(*) AS n FROM task_runs
            WHERE file_task_id = :fileTaskId AND status = 'skipped' AND skip_reason = :reason AND id > :afterId`,
      args: { fileTaskId, reason, afterId },
    });
    return Number(rows[0].n);
  }

  async startTaskRun(taskRunId: number) {
    await this.db.execute({
      sql: "UPDATE task_runs SET started_at = :started_at, status = 'running' WHERE id = :id",
      args: {
        started_at: Date.now(),
        id: taskRunId,
      },
    });
  }

  async endTaskRun(taskRunId: number, status: "success" | "failure", result: string | null = null) {
    await this.db.execute({
      sql: "UPDATE task_runs SET ended_at = :ended_at, status = :status, result = :result WHERE id = :id",
      args: {
        ended_at: Date.now(),
        status,
        result,
        id: taskRunId,
      },
    });
  }

  async getById(taskId: number) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM task_runs WHERE id = :taskId",
      args: { taskId },
    });

    return rows[0] as unknown as TaskRun;
  }

  async listByTaskVersion(fileTaskId: number, fileTaskVersionId: number) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM task_runs WHERE file_task_id = :fileTaskId AND file_task_version_id = :fileTaskVersionId ORDER BY started_at DESC LIMIT 100",
      args: { fileTaskId, fileTaskVersionId },
    });

    return rows as unknown as TaskRun[];
  }
}
