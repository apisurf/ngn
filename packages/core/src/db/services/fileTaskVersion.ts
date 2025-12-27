import { Client } from "op3-persistence";
import z from "zod";
import { $fileTaskVersion } from "op3-schema";

const $fileTaskVersionInsert = $fileTaskVersion.omit({
  id: true,
  created_at: true,
});

type FileTaskVersion = z.infer<typeof $fileTaskVersion>;
type FileTaskVersionInsert = z.infer<typeof $fileTaskVersionInsert>;

export class FileTaskVersionService {
  constructor(private db: Client) {}

  async add(taskVersion: FileTaskVersionInsert) {
    const { file_task_id, md5_hash, version, compiled_code } =
      $fileTaskVersionInsert.parse(taskVersion);

    const sql = `
      INSERT INTO file_task_versions (file_task_id, md5_hash, version, compiled_code)
      VALUES (:file_task_id, :md5_hash, :version, :compiled_code)
    `;

    return this.db.execute({
      sql,
      args: { file_task_id, md5_hash, version, compiled_code },
    });
  }

  async getByHash(hash: string, file_task_id: number) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM file_task_versions WHERE md5_hash = :md5_hash AND file_task_id = :file_task_id ORDER BY version DESC LIMIT 1",
      args: { md5_hash: hash, file_task_id },
    });

    return rows[0] as unknown as FileTaskVersion | undefined;
  }

  async getByVersion(version: number, file_task_id: number) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM file_task_versions WHERE version = :version AND file_task_id = :file_task_id LIMIT 1",
      args: { version, file_task_id },
    });

    return rows[0] as unknown as FileTaskVersion | undefined;
  }

  async getLastVersion(file_task_id: number) {
    const { rows } = await this.db.execute({
      sql: "SELECT MAX(version) as version FROM file_task_versions WHERE file_task_id = :file_task_id",
      args: { file_task_id },
    });

    return (rows[0]?.version as number | undefined) ?? 0;
  }

  async getById(id: number) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM file_task_versions WHERE id = :id LIMIT 1",
      args: { id },
    });

    return rows[0] as unknown as FileTaskVersion | undefined;
  }

  async getCompiledCode(id: number): Promise<string | undefined> {
    const { rows } = await this.db.execute({
      sql: "SELECT compiled_code FROM file_task_versions WHERE id = :id LIMIT 1",
      args: { id },
    });

    return rows[0]?.compiled_code as string | undefined;
  }
}
