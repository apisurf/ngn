import { Client } from "@apisurf/ngn-persistence";

export class LogService {
  constructor(private db: Client) {}

  async logInfo(fileTaskId: number, taskRunId: number, value: string) {
    return this.add(fileTaskId, taskRunId, "info", value);
  }

  async logWarning(fileTaskId: number, taskRunId: number, value: string) {
    return this.add(fileTaskId, taskRunId, "warning", value);
  }

  async logError(fileTaskId: number, taskRunId: number, value: string) {
    return this.add(fileTaskId, taskRunId, "error", value);
  }

  private async add(
    fileTaskId: number,
    taskRunId: number,
    status: "info" | "warning" | "error",
    value: string
  ) {
    const { rows } = await this.db.execute({
      sql: "INSERT INTO logs (file_task_id, task_run_id, status, value) VALUES (:fileTaskId, :taskRunId, :status, :value) RETURNING id",
      args: { fileTaskId, taskRunId, status, value },
    });

    return rows[0].id as number;
  }
}
