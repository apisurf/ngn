import { Client } from "@apisurf/ngn-persistence";
import z from "zod";
import { $taskRun } from "@apisurf/ngn-schema";

type TaskRun = z.infer<typeof $taskRun>;

export class TaskRunService {
  constructor(private db: Client) {}

  async initTaskRun(data: { file_task_id: number; file_task_version_id: number }) {
    const { rows } = await this.db.execute({
      sql: "INSERT INTO task_runs (file_task_id, file_task_version_id, status) VALUES (:file_task_id, :file_task_version_id, 'pending') RETURNING id",
      args: {
        file_task_id: data.file_task_id,
        file_task_version_id: data.file_task_version_id,
      },
    });

    return rows[0].id as number;
  }

  async skipTaskRun(taskRunId: number) {
    await this.db.execute({
      sql: "UPDATE task_runs SET status = 'skipped', ended_at = :ended_at WHERE id = :id",
      args: { id: taskRunId, ended_at: Date.now() },
    });
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

  async endTaskRun(taskRunId: number, status: "success" | "failure") {
    await this.db.execute({
      sql: "UPDATE task_runs SET ended_at = :ended_at, status = :status WHERE id = :id",
      args: {
        ended_at: Date.now(),
        status,
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
