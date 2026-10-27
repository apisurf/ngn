import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileDescriptor } from "@apisurf/ngn-os";
import { safeInitDbClient, type Client } from "@apisurf/ngn-persistence";
import { Compiler } from "../src/source/compiler.js";
import { createControlsGenerator } from "../src/runtime/generateControls.js";
import { Task } from "../src/runtime/task.js";
import { closeTaskDatabases } from "../src/runtime/taskSqlite.js";

/**
 * A scratch project: a temp folder for task files and their databases, and an
 * in-memory ngn database with the real schema.
 */
export async function createHarness({ file = false }: { file?: boolean } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "ngn-core-test-"));
  // A file when a test needs a second connection to it, standing in for a second process.
  const dbUrl = file ? (`file:${join(rootDir, "ngn.sqlite")}` as const) : ":memory:";
  const db: Client = await safeInitDbClient(dbUrl);
  const compiler = new Compiler({ minify: false, silent: true });
  const buildConfigFn = createControlsGenerator({ dbClient: db, env: {} });

  /** Compile `source` as if it were `relativePath` in the project, and wrap it in a Task. */
  async function task(relativePath: string, source: string) {
    const descriptor = createFileDescriptor({ rootDir, path: relativePath });
    const compiledCode = await compiler.compileFromSource(source, descriptor.path.absolute);
    return new Task({
      buildConfigFn,
      entryParams: { compiledCode, descriptor, tasksRootDir: rootDir },
    });
  }

  async function query<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
    const { rows } = await db.execute({ sql, args: args as never });
    return rows as unknown as T[];
  }

  function dispose() {
    closeTaskDatabases();
    db.close();
    rmSync(rootDir, { recursive: true, force: true });
  }

  return { rootDir, dbUrl, db, task, query, dispose };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/**
 * Gates a test can open one at a time. Task code runs in its own VM context
 * but sees globalThis as it was when the run started, so a task reaches these
 * through `globalThis.__gates`.
 */
export function createGates() {
  const waiting = new Map<string, Array<() => void>>();
  const opened = new Set<string>();

  const gates = {
    wait(name: string) {
      if (opened.has(name)) return Promise.resolve();
      return new Promise<void>((resolve) =>
        waiting.set(name, [...(waiting.get(name) ?? []), resolve]),
      );
    },
    open(name: string) {
      opened.add(name);
      for (const resolve of waiting.get(name) ?? []) resolve();
      waiting.delete(name);
    },
    isWaiting(name: string) {
      return waiting.has(name);
    },
  };

  (globalThis as Record<string, unknown>).__gates = gates;
  return gates;
}

/** Resolve once `check` holds, polling; fails the test after a second. */
export async function until(check: () => boolean | Promise<boolean>, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
