import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTaskDatabases, createTaskSqlite } from "../src/runtime/taskSqlite.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ngn-task-sqlite-test-"));
});

afterEach(() => {
  closeTaskDatabases();
  rmSync(dir, { recursive: true, force: true });
});

const sidecars = (path: string) => ["-wal", "-shm", "-journal"].map((suffix) => path + suffix);

describe("destroyDB", () => {
  it("removes the database and the files SQLite keeps beside it", async () => {
    const sqlite = createTaskSqlite(join(dir, "task.ts"));
    const db = await sqlite.initDB({ file: "scratch.db" });
    await db.execute("CREATE TABLE t (n INTEGER)");
    await db.execute("INSERT INTO t (n) VALUES (1)");
    // Otherwise the test would pass without there being anything to clean up
    expect(sidecars(db.path).some(existsSync)).toBe(true);

    await sqlite.destroyDB("scratch.db");

    expect(existsSync(db.path)).toBe(false);
    expect(sidecars(db.path).filter(existsSync)).toEqual([]);
  });

  it("still throws for a database that does not exist", async () => {
    const sqlite = createTaskSqlite(join(dir, "task.ts"));

    await expect(sqlite.destroyDB("missing.db")).rejects.toThrow(/ENOENT/);
  });
});
