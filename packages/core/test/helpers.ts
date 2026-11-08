import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileDescriptor } from "@apisurf/ngn-os";
import { safeInitDbClient, type Client } from "@apisurf/ngn-persistence";
import { Compiler } from "../src/source/compiler.js";
import { createControlsGenerator } from "../src/runtime/generateControls.js";
import { Task } from "../src/runtime/task.js";
import { TaskLibrary } from "../src/runtime/taskLibrary.js";
import { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
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

  /** A Task compiled from `source` as if it were `relativePath`, recording through `build`. */
  async function compileTask(build: typeof buildConfigFn, relativePath: string, source: string) {
    const descriptor = createFileDescriptor({ rootDir, path: relativePath });
    const compiledCode = await compiler.compileFromSource(source, descriptor.path.absolute);
    return new Task({
      buildConfigFn: build,
      entryParams: { compiledCode, descriptor, tasksRootDir: rootDir },
    });
  }

  /** Compile `source` as if it were `relativePath` in the project, and wrap it in a Task. */
  function task(relativePath: string, source: string) {
    return compileTask(buildConfigFn, relativePath, source);
  }

  const others: Client[] = [];

  /**
   * Another process on the same database file: its own connection, and tasks
   * that record through it. Needs `createHarness({ file: true })`.
   */
  async function connect() {
    const other = await safeInitDbClient(dbUrl);
    others.push(other);
    const build = createControlsGenerator({ dbClient: other, env: {} });
    return {
      db: other,
      task: (relativePath: string, source: string) => compileTask(build, relativePath, source),
    };
  }

  async function query<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
    const { rows } = await db.execute({ sql, args: args as never });
    return rows as unknown as T[];
  }

  function dispose() {
    closeTaskDatabases();
    for (const other of others) other.close();
    db.close();
    rmSync(rootDir, { recursive: true, force: true });
  }

  return { rootDir, dbUrl, db, task, connect, query, dispose };
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

/**
 * A clock a test moves by hand. `sleep` resolves once `advance` has moved the
 * time past it, so the scheduler's waits (a second at a time) follow the test.
 */
export function createFakeClock(start = Date.now()) {
  let now = start;
  const sleepers = new Set<{ at: number; wake: () => void }>();
  return {
    now: () => now,
    sleep(ms: number, signal?: AbortSignal) {
      return new Promise<void>((resolve) => {
        if (signal?.aborted || ms <= 0) return resolve();
        const sleeper = {
          at: now + ms,
          wake: () => {
            sleepers.delete(sleeper);
            resolve();
          },
        };
        sleepers.add(sleeper);
        signal?.addEventListener("abort", sleeper.wake, { once: true });
      });
    },
    /** Move the time on, waking every sleep that has come due. */
    advance(ms: number) {
      now += ms;
      for (const sleeper of sleepers) if (sleeper.at <= now) sleeper.wake();
    },
    /** Jump to `at` (backwards too), waking every sleep that has come due. */
    set(at: number) {
      now = at;
      for (const sleeper of sleepers) if (sleeper.at <= now) sleeper.wake();
    },
    /** How many sleeps are pending: the scheduler is waiting when this is above 0. */
    get sleeping() {
      return sleepers.size;
    },
  };
}

export type FakeClock = ReturnType<typeof createFakeClock>;

export interface EventRow {
  id: number;
  file_task_id: number;
  at: number;
  event: string;
  from_state: string | null;
  to_state: string;
  next_at: number | null;
  reason: string | null;
  source: string | null;
  holder: string | null;
  anchor: number | null;
  request: string | null;
  origin: string | null;
  first_run_id: number | null;
  run_id: number | null;
  previous_next_at: number | null;
}

/** A task's schedule events, oldest first, by task path. */
export async function scheduleEvents(h: Harness, path: string) {
  return h.query<EventRow>(
    `SELECT e.* FROM schedule_events e JOIN file_tasks t ON t.id = e.file_task_id
     WHERE t.path = ? ORDER BY e.id`,
    [path],
  );
}

/** How many `event`s a task's log has. */
export async function countEvents(h: Harness, path: string, event: string) {
  return (await eventNames(h, path)).filter((name) => name === event).length;
}

/** Whether any log line starts with `prefix`. */
export async function hasLogLine(h: Harness, prefix: string) {
  const [row] = await h.query("SELECT 1 FROM logs WHERE substr(value, 1, ?) = ? LIMIT 1", [
    prefix.length,
    prefix,
  ]);
  return row != null;
}

/** Just the event names of a task's log. */
export async function eventNames(h: Harness, path: string) {
  return (await scheduleEvents(h, path)).map((e) => e.event);
}

/** A task's schedule row, by path. */
export async function scheduleRow(h: Harness, path: string) {
  const [row] = await h.query<{
    state: string;
    next_at: number | null;
    reason: string | null;
    source: string | null;
    holder: string | null;
    anchor: number | null;
    request: string | null;
  }>(`SELECT s.* FROM schedules s JOIN file_tasks t ON t.id = s.file_task_id WHERE t.path = ?`, [
    path,
  ]);
  return row ?? null;
}

/**
 * Schedule `sources` (path → code) the way `ngn run` does, collecting what goes
 * wrong. `via` compiles the tasks against another connection, as another process.
 */
export async function startScheduler(
  h: Harness,
  sources: Record<string, string>,
  {
    via = h,
    ...options
  }: Omit<ConstructorParameters<typeof TaskLibraryScheduler>[0], "taskLibrary"> & {
    via?: Pick<Harness, "task">;
  } = {},
) {
  const library = new TaskLibrary();
  for (const [path, source] of Object.entries(sources)) library.add(await via.task(path, source));
  const errors: unknown[] = [];
  const problems: string[] = [];
  const scheduler = new TaskLibraryScheduler({
    taskLibrary: library,
    onRunError: (_path, error) => errors.push(error),
    onScheduleProblem: (_path, message) => problems.push(message),
    ...options,
  });
  const report = await scheduler.start();
  return { scheduler, report, errors, problems, library };
}
