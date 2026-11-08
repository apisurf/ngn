import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDbFileIfNotExists, openDbClient } from "@apisurf/ngn-persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logs } from "../src/cliCmd/logs";
import { runs } from "../src/cliCmd/runs";
import { show } from "../src/cliCmd/show";
import { status, UNHEALTHY_EXIT } from "../src/cliCmd/status";
import { schedule } from "../src/cliCmd/schedule";
import { formatClock } from "@apisurf/ngn-schema/describe";

const HOUR = 3_600_000;
const NOW = Date.now();
const COMPILED = (
  timing: string,
) => `__export(x_exports, { task: () => task, timing: () => timing });
  var timing = "${timing}";`;

let db: string;

/**
 * tasks/extract.ts every 5 minutes: a success, a run that never ended two
 * hours ago (Stalled), and a tick skipped behind it.
 * tasks/sync.ts every minute: a failure that logged why.
 */
beforeEach(async () => {
  db = join(tmpdir(), `ngn-read-${randomUUID()}.sqlite`);
  await initDbFileIfNotExists(`file:${db}`);
  const client = openDbClient(`file:${db}`);
  const exec = (sql: string, args: (string | number | null)[] = []) =>
    client.execute({ sql, args });
  await exec(
    "INSERT INTO file_tasks (id, path, parent_path, created_at, updated_at) VALUES (1, 'tasks/extract.ts', 'tasks', 0, 0), (2, 'tasks/sync.ts', 'tasks', 0, 0)",
  );
  await exec(
    "INSERT INTO file_task_versions (id, file_task_id, version, md5_hash, compiled_code, created_at) VALUES (1, 1, 1, 'a', ?, 0), (2, 2, 1, 'b', ?, 0)",
    [COMPILED("*/5 * * * *"), COMPILED("0 * * * * *")],
  );
  const run =
    "INSERT INTO task_runs (id, file_task_id, file_task_version_id, status, created_at, started_at, ended_at, skip_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
  await exec(run, [1, 1, 1, "success", NOW - 3 * HOUR, NOW - 3 * HOUR, NOW - 3 * HOUR + 500, null]);
  await exec(run, [2, 1, 1, "running", NOW - 2 * HOUR, NOW - 2 * HOUR, null, null]);
  await exec(run, [
    3,
    1,
    1,
    "skipped",
    NOW - HOUR,
    null,
    NOW - HOUR,
    "previous run still in progress",
  ]);
  await exec(run, [4, 2, 2, "failure", NOW - 60_000, NOW - 60_000, NOW - 59_000, null]);
  const log =
    "INSERT INTO logs (file_task_id, task_run_id, status, value, created_at) VALUES (?, ?, ?, ?, ?)";
  await exec(log, [2, 4, "info", "Task started", NOW - 60_000]);
  await exec(log, [2, 4, "warning", "slow upstream", NOW - 59_800]);
  await exec(log, [2, 4, "error", "upstream returned 503", NOW - 59_500]);
  await exec(log, [2, 4, "error", "Task failed", NOW - 59_000]);
  // sync.ts's schedule: decided after run 4, next in four minutes.
  const event =
    "INSERT INTO schedule_events (file_task_id, at, event, from_state, to_state, next_at, reason, source, origin, first_run_id, run_id) VALUES (2, ?, ?, ?, ?, ?, ?, 'policy', ?, ?, ?)";
  await exec(event, [
    NOW - 2 * 60_000,
    "scheduled",
    null,
    "waiting",
    NOW - 60_000,
    "first run",
    null,
    null,
    null,
  ]);
  await exec(event, [
    NOW - 60_000,
    "started",
    "waiting",
    "running",
    NOW - 60_000,
    "first run",
    "scheduled",
    null,
    null,
  ]);
  await exec(event, [
    NOW - 59_000,
    "decided",
    "running",
    "waiting",
    NOW + 4 * 60_000,
    "every minute",
    null,
    4,
    4,
  ]);
  await exec(
    "INSERT INTO schedules (file_task_id, state, next_at, reason, source, updated_at) VALUES (2, 'waiting', ?, 'every minute', 'policy', ?)",
    [NOW + 4 * 60_000, NOW - 59_000],
  );
  await exec("UPDATE task_runs SET next_at = ?, next_reason = 'every minute' WHERE id = 4", [
    NOW + 4 * 60_000,
  ]);
  client.close();
});

afterEach(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${db}${suffix}`, { force: true });
  process.exitCode = undefined;
});

/** Everything a spied-on stream was given. */
function written(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((c) => String(c[0])).join("");
}

/** What a command printed, stdout and stderr apart. */
async function capture(fn: () => Promise<void>) {
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  await fn();
  const result = { stdout: written(out), stderr: written(err), code: process.exitCode };
  out.mockRestore();
  err.mockRestore();
  return result;
}

describe("ngn status", () => {
  it("leads with the verdict and exits 2 when something is wrong", async () => {
    const { stdout, code } = await capture(() => status({ db }));
    expect(stdout.split("\n")[0]).toMatch(
      /^✗ 1 task failing · 1 run stalled since .* · extract\.ts skipping ticks$/,
    );
    expect(stdout).toMatch(/tasks\/extract\.ts\s+every 5 minutes\s+—\s+stalled/);
    expect(stdout).toMatch(/tasks\/sync\.ts\s+every minute\s+in 4m\s+failing/);
    expect(code).toBe(UNHEALTHY_EXIT);
  });

  it("gives the same answer as JSON", async () => {
    const { stdout } = await capture(() => status({ db, json: true }));
    const parsed = JSON.parse(stdout) as {
      verdict: { tone: string };
      tasks: { health: string }[];
      stalled: number[];
    };
    expect(parsed.verdict.tone).toBe("bad");
    expect(parsed.tasks.map((t) => t.health)).toEqual(["stalled", "failing"]);
    expect(parsed.stalled).toEqual([2]);
    expect(parsed.tasks[1]).toMatchObject({
      state: "waiting",
      next_at: NOW + 4 * 60_000,
      next_reason: "every minute",
    });
  });
});

describe("a blocked task", () => {
  it("names the run and process it waits on, in status and schedule", async () => {
    const client = openDbClient(`file:${db}`);
    await client.execute({
      sql: "INSERT INTO schedule_events (file_task_id, at, event, from_state, to_state, next_at, holder, run_id) VALUES (2, ?, 'blocked', 'waiting', 'blocked', ?, '4242:x', 4)",
      args: [NOW, NOW],
    });
    await client.execute(
      "UPDATE schedules SET state = 'blocked', holder = '4242:x' WHERE file_task_id = 2",
    );
    client.close();

    expect((await capture(() => status({ db }))).stdout).toContain(
      "blocked by run #4 in process 4242",
    );
    const parsed = JSON.parse((await capture(() => status({ db, json: true }))).stdout) as {
      tasks: { blocked_by: number | null; process: string | null }[];
    };
    expect(parsed.tasks[1]).toMatchObject({ blocked_by: 4, process: "4242" });
    expect((await capture(() => schedule("sync", { db }))).stdout).toMatch(
      /state {3}blocked by run #4 in process 4242/,
    );
  });
});

describe("ngn schedule", () => {
  it("prints the state, the next run and why, then the log in words", async () => {
    const { stdout } = await capture(() => schedule("sync", { db }));
    expect(stdout).toContain("tasks/sync.ts · every minute");
    expect(stdout).toMatch(/state {3}waiting/);
    expect(stdout).toMatch(/next {4}.*\(in 4m\): every minute/);
    expect(stdout).toContain(
      `decided (run #4): next ${formatClock(NOW + 4 * 60_000)}, every minute`,
    );
  });

  it("gives the same as JSON", async () => {
    const { stdout } = await capture(() => schedule("tasks/sync.ts", { db, json: true }));
    const parsed = JSON.parse(stdout) as {
      schedule: { state: string; next_at: number };
      events: { event: string }[];
    };
    expect(parsed.schedule).toMatchObject({ state: "waiting", next_at: NOW + 4 * 60_000 });
    expect(parsed.events.map((e) => e.event)).toEqual(["scheduled", "started", "decided"]);
  });

  it("says when a task has no schedule yet, and refuses a name that fits nothing", async () => {
    expect((await capture(() => schedule("extract", { db }))).stdout).toContain("No schedule yet");
    const { stderr, code } = await capture(() => schedule("nope", { db }));
    expect(stderr).toContain('no task matched "nope"');
    expect(code).toBe(1);
  });
});

describe("ngn runs", () => {
  const ids = async (query: string[], options: Parameters<typeof runs>[1] = {}) => {
    const { stdout } = await capture(() => runs(query, { db, json: true, ...options }));
    return (JSON.parse(stdout) as { id: number }[]).map((r) => r.id);
  };

  it("lists runs newest first in the glossary's words", async () => {
    const { stdout } = await capture(() => runs([], { db }));
    expect(stdout).toMatch(/3\s+tasks\/extract\.ts\s+Skipped · still running #2/);
    expect(stdout).toMatch(/2\s+tasks\/extract\.ts\s+Stalled/);
    expect(await ids([])).toEqual([4, 3, 2, 1]);
  });

  it("filters the same way by flags and by tokens", async () => {
    expect(await ids([], { status: "stalled" })).toEqual([2]);
    expect(await ids(["status:stalled"])).toEqual([2]);
    expect(await ids([], { task: "extract", status: "succeeded,skipped" })).toEqual([3, 1]);
    expect(await ids(["task:extract", "-status:skipped"])).toEqual([2, 1]);
    expect(await ids(["since:90m"])).toEqual([4, 3]);
    expect(await ids(["status:running"])).toEqual([]);
  });

  it("reports a filter it cannot read", async () => {
    const { stderr, code } = await capture(() => runs(["colour:red"], { db }));
    expect(stderr).toContain('unknown filter "colour:"');
    expect(code).toBe(1);
  });
});

describe("ngn show", () => {
  it("leads a failed run with what the task logged", async () => {
    const { stdout } = await capture(() => show("4", { db }));
    expect(stdout).toContain(`Then: next run ${formatClock(NOW + 4 * 60_000)}: every minute`);
    expect(stdout).toContain("sync.ts #4 · Failed");
    expect(stdout).toContain("The task failed\n  upstream returned 503");
    expect(stdout).toContain("Logs (2)");
  });

  it("names a skipped run's blocker and a stalled run's state", async () => {
    expect((await capture(() => show("#3", { db }))).stdout).toContain("Run #2 was still going");
    expect((await capture(() => show("2", { db }))).stdout).toContain("Stalled — no end recorded");
  });

  it("says so for a run that is not there", async () => {
    const { stderr, code } = await capture(() => show("99", { db }));
    expect(stderr).toContain("there is no run 99");
    expect(code).toBe(1);
  });
});

describe("ngn logs", () => {
  it("prints a run's lines by level, warn and warning alike", async () => {
    const { stdout } = await capture(() => logs("4", { db, level: "warn" }));
    expect(stdout.trim().split("\n")).toEqual([
      expect.stringMatching(/WARN\s+slow upstream$/),
      expect.stringMatching(/ERROR\s+upstream returned 503$/),
    ]);
  });

  it("takes a task by name, across its runs", async () => {
    const { stdout } = await capture(() => logs("sync", { db }));
    expect(stdout).toContain("#4  INFO  slow upstream".replace("INFO ", "WARN "));
  });

  it("explains a name that is not a task", async () => {
    const { stderr, code } = await capture(() => logs("nope", { db }));
    expect(stderr).toContain('no task matched "nope"');
    expect(code).toBe(1);
  });
});
