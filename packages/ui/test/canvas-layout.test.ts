import { describe, expect, it } from "vitest";
import type { LayoutInput } from "../src/canvas/layout";
import { batches, BATCH_GAP_MS, layout, nodeId, spotlight, tree } from "../src/canvas/layout";
import type { RunItem, TaskItem } from "../src/server/api";

function task(id: number, path: string, extra: Partial<TaskItem> = {}): TaskItem {
  const cut = path.lastIndexOf("/");
  const file = path.slice(cut + 1);
  return {
    id,
    path,
    dir: cut < 0 ? "" : path.slice(0, cut + 1),
    file,
    editor: file.startsWith("live-task-"),
    run_count: 1,
    last_outcome: null,
    last_run_at: null,
    ...extra,
  } as TaskItem;
}

function run(id: number, of: TaskItem, at: number, extra: Partial<RunItem> = {}): RunItem {
  return {
    id,
    task_id: of.id,
    path: of.path,
    dir: of.dir,
    file: of.file,
    editor: of.editor,
    status: "success",
    stalled: false,
    at,
    ...extra,
  } as RunItem;
}

const sync = task(1, "tasks/api/sync-users.ts");
const health = task(2, "tasks/health.ts");
const root = task(3, "cleanup.ts");
const live = task(4, "live-task-1700000000000-abc123.ts", { last_run_at: 5 });

const T0 = 10_000_000;

function input(extra: Partial<LayoutInput> = {}): LayoutInput {
  return {
    tasks: [sync, health, root, live],
    runs: [
      run(12, sync, T0, { status: "failure" }),
      run(11, health, T0 - 60_000),
      run(10, live, T0 - BATCH_GAP_MS * 3),
    ],
    totalRuns: 40,
    focus: {},
    hover: null,
    ...extra,
  };
}

describe("tree", () => {
  it("lists folders first, then tasks, each by name", () => {
    const top = tree([sync, health, root]);
    expect(top.dirs.map((d) => d.path)).toEqual(["tasks/"]);
    expect(top.tasks.map((t) => t.file)).toEqual(["cleanup.ts"]);
    const tasks = top.dirs[0]!;
    expect(tasks.dirs.map((d) => d.name)).toEqual(["api/"]);
    expect(tasks.tasks.map((t) => t.file)).toEqual(["health.ts"]);
  });
});

const runIds = (batch: RunItem[]) => batch.map((r) => r.id);

describe("batches", () => {
  it("cuts where runs started more than the gap apart", () => {
    expect(batches(input().runs).map(runIds)).toEqual([[12, 11], [10]]);
  });
});

describe("layout", () => {
  it("draws scheduled tasks as a tree and editor runs under one Editor row", () => {
    const { nodes } = layout(input());
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain(nodeId.folder("tasks/api/"));
    expect(ids).toContain(nodeId.source(sync.id));
    expect(ids).not.toContain(nodeId.source(live.id));
    const editor = nodes.find((n) => n.id === nodeId.source("editor"));
    expect(editor?.type).toBe("editor");
  });

  it("ties each run to its task, and editor runs to the Editor", () => {
    const { edges } = layout(input());
    const links = edges.filter((e) => e.type === "link").map((e) => [e.source, e.target]);
    expect(links).toEqual([
      [nodeId.source(sync.id), nodeId.run(12)],
      [nodeId.source(health.id), nodeId.run(11)],
      [nodeId.source("editor"), nodeId.run(10)],
    ]);
    expect(edges.find((e) => e.target === nodeId.run(12))?.data?.failed).toBe(true);
  });

  it("says how many older runs there are", () => {
    const older = layout(input()).nodes.find((n) => n.id === nodeId.older());
    expect(older?.data).toEqual({ count: 37 });
  });

  it("marks what the open page is about", () => {
    const { nodes } = layout(input({ focus: { source: sync.id, runId: 12 } }));
    const focused = nodes.filter((n) => "focused" in n.data && n.data.focused).map((n) => n.id);
    expect(focused).toEqual([nodeId.source(sync.id), nodeId.run(12)]);
  });
});

describe("spotlight", () => {
  it("lights a hovered task's runs and the folders above it, and dims the rest", () => {
    const { lit, dims } = spotlight(input({ hover: { source: sync.id } }));
    expect([...lit].toSorted()).toEqual(
      [
        nodeId.source(sync.id),
        nodeId.run(12),
        nodeId.folder("tasks/"),
        nodeId.folder("tasks/api/"),
      ].toSorted(),
    );
    expect(dims).toBe(true);
  });

  it("lights a focused run's task without dimming anything", () => {
    const { lit, dims } = spotlight(input({ focus: { runId: 10 } }));
    expect(lit.has(nodeId.source("editor"))).toBe(true);
    expect(dims).toBe(false);
  });
});
