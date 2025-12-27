import { Client } from "op3-persistence";
import z from "zod";
import { $fileTask, $fileTaskInsert } from "op3-schema";

type FileTask = z.infer<typeof $fileTask>;
type FileTaskInsert = z.infer<typeof $fileTaskInsert>;

export class FileTaskService {
  constructor(private db: Client) {}

  async add(task: FileTaskInsert) {
    const { path, status } = $fileTaskInsert.parse(task);

    const sql = `
      INSERT INTO file_tasks (path, parent_path, status)
      VALUES (:path, :parentPath, :status)
    `;

    return this.db.execute({
      sql,
      args: { path, parentPath: task.parent_path, status },
    });
  }

  async del(id: number) {
    return this.db.execute({
      sql: "DELETE FROM file_tasks WHERE id = :id",
      args: { id },
    });
  }

  async getByPath(path: string) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM file_tasks WHERE path = :path LIMIT 1",
      args: { path },
    });

    return rows[0] as unknown as FileTask | undefined;
  }

  async list() {
    const { rows } = await this.db.execute(
      "SELECT * FROM file_tasks LIMIT 1000"
    );

    return rows as unknown as FileTask[];
  }

  async bumpUpdatedAt(id: number) {
    return this.db.execute({
      sql: "UPDATE file_tasks SET updated_at = :updatedAt WHERE id = :id",
      args: { updatedAt: new Date().valueOf(), id },
    });
  }

  async updateStatus(id: number, status: "active" | "removed") {
    return this.db.execute({
      sql: "UPDATE file_tasks SET status = :status WHERE id = :id",
      args: { status, id },
    });
  }
}
