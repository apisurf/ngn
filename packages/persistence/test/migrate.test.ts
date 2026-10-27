import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDbClient, safeInitDbClient, type Client } from "../src/client.js";
import { migrations } from "../src/migration.js";

const paths: string[] = [];
const clients: Client[] = [];

function tempFile() {
  const path = join(tmpdir(), `ngn-migrate-${randomUUID()}.sqlite`);
  paths.push(path);
  return path;
}

function track(client: Client) {
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  for (const path of paths.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  }
});

async function appliedIds(client: Client) {
  const { rows } = await client.execute("SELECT id FROM ngn_migrations ORDER BY id");
  return rows.map((row) => row.id);
}

async function tables(client: Client) {
  const { rows } = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  return rows.map((row) => row.name as string);
}

const allIds = migrations.map((migration) => migration.id);

describe("migrate", () => {
  it("brings a fresh file up to date", async () => {
    const client = track(await safeInitDbClient(`file:${tempFile()}`));

    expect(await appliedIds(client)).toEqual(allIds);
    expect(await tables(client)).toEqual(expect.arrayContaining(["file_tasks", "task_runs"]));
  });

  it("brings an in-memory database up to date", async () => {
    const client = track(await safeInitDbClient(":memory:"));

    expect(await appliedIds(client)).toEqual(allIds);
  });

  it("treats a 0.2.x file as having the initial schema, and applies the rest", async () => {
    const path = tempFile();
    const legacy = openDbClient(`file:${path}`);
    // What 0.2.x wrote: the initial schema, nothing tracking it.
    await legacy.batch(
      migrations[0].up
        .split(";")
        .map((stmt) => stmt.trim())
        .filter(Boolean),
      "write",
    );
    await legacy.execute(
      "INSERT INTO file_tasks (path, parent_path) VALUES ('tasks/a.ts', 'tasks')",
    );
    legacy.close();

    const client = track(await safeInitDbClient(`file:${path}`));

    expect(await appliedIds(client)).toEqual(allIds);
    // The existing rows survive: the initial schema was not run a second time.
    const { rows } = await client.execute("SELECT path FROM file_tasks");
    expect(rows.map((row) => row.path)).toEqual(["tasks/a.ts"]);
  });

  it("applies nothing to a file that is already current", async () => {
    const path = tempFile();
    track(await safeInitDbClient(`file:${path}`));

    const again = track(openDbClient(`file:${path}`));
    expect(await migrate(again)).toEqual([]);
    expect(await appliedIds(again)).toEqual(allIds);
  });
});
