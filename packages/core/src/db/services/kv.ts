import { Client } from "op3-persistence";
import z from "zod";
import { $kv } from "op3-schema";

type KV = z.infer<typeof $kv>;

function normalizeValue(value: unknown): string | null {
  if (typeof value !== "string") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      try {
        return value?.toString() ?? null;
      } catch (error) {
        console.error("Error setting key-value pair in db", error);
        return null;
      }
    }
  } else {
    return value;
  }
}

export class KVService {
  constructor(private db: Client) {}

  async getValue(fileTaskId: number, key: string) {
    const { rows } = await this.db.execute({
      sql: "SELECT * FROM kvs WHERE file_task_id = :fileTaskId AND key = :key LIMIT 1",
      args: { fileTaskId, key },
    });

    return (rows[0] as unknown as KV)?.value;
  }

  async setValue(fileTaskId: number, key: string, value: string) {
    const existingValue = await this.getValue(fileTaskId, key);
    const normalizedValue = normalizeValue(value);

    if (existingValue) {
      return this.db.execute({
        sql: "UPDATE kvs SET value = :value WHERE file_task_id = :fileTaskId AND key = :key",
        args: { fileTaskId, key, value: normalizedValue },
      });
    }

    return this.db.execute({
      sql: "INSERT INTO kvs (file_task_id, key, value) VALUES (:fileTaskId, :key, :value)",
      args: { fileTaskId, key, value: normalizedValue },
    });
  }

  async deleteValue(fileTaskId: number, key: string) {
    return this.db.execute({
      sql: "DELETE FROM kvs WHERE file_task_id = :fileTaskId AND key = :key",
      args: { fileTaskId, key },
    });
  }
}
