// Where everything sits on the canvas.
//
// The canvas has two columns. On the left are the tasks: the files ngn run
// schedules, as a tree of their folders, then the Editor, which runs code once.
// On the right are the runs, newest first, in batches of runs that started
// close together. A faint line ties each run to the task it came from.
//
//   TASKS                           RUNS
//   Scheduled                       2 min ago · 5 runs · 1 failed
//   tasks/                          ┌──────────────────────────────┐
//   ├ api/                       ╭──│ ● #64 sync-users.ts  Failed  │
//   │ └ sync-users.ts   12 ●  ───╯  └──────────────────────────────┘
//   └ health.ts         40    ────── ● #63 health.ts
//   Editor                          1 h ago · 1 run
//   Editor runs          2    ────── ● #9  Editor run
//
// Everything is placed here, as plain numbers: nothing is dragged, so a layout
// is always the same for the same database. Pure, so it can be tested without a
// browser; React Flow only draws it.

import type { Edge, Node } from "@xyflow/react";
import type { RunItem, TaskItem } from "~/server/api";

// -----------------------------------------------------------------------------
// Sizes. Nodes are drawn at exactly these, so the layout never has to measure.
// -----------------------------------------------------------------------------

export const SIZE = {
  /** A task, folder or the editor in the tree. */
  row: { h: 28 },
  tasks: { x: 0, w: 300 },
  runs: { x: 420, w: 400 },
  /** A run in the runs column, and the gap under it. */
  run: { h: 26, gap: 4 },
  heading: { h: 44 },
  section: { h: 30 },
  batch: { h: 34 },
} as const;

/** How far each level of the tree sits in from its parent. */
export const INDENT = 18;
/** Runs that start within this long of the one before share a batch. */
export const BATCH_GAP_MS = 3 * 60_000;
/** Space above a section that follows another. */
const SECTION_GAP = 16;

/** What a run is tied to: a task by its id, or the Editor for every editor run. */
export type SourceKey = number | "editor";

export const nodeId = {
  heading: (column: "tasks" | "runs") => `heading:${column}`,
  section: (key: string) => `section:${key}`,
  folder: (path: string) => `folder:${path}`,
  source: (key: SourceKey) => (key === "editor" ? "editor" : `task:${key}`),
  batch: (index: number) => `batch:${index}`,
  run: (id: number) => `run:${id}`,
  older: () => "older",
};

// -----------------------------------------------------------------------------
// What a node carries
// -----------------------------------------------------------------------------

/**
 * How a node stands while something is in the spotlight: `lit` is the thing
 * itself or tied to it, `dim` is everything else. Both are false when nothing is.
 */
export interface Lighting {
  lit: boolean;
  dim: boolean;
}

export interface HeadingData extends Record<string, unknown> {
  title: string;
  note: string;
}

export interface SectionData extends Record<string, unknown> {
  title: string;
  note: string;
}

export interface FolderData extends Record<string, unknown>, Lighting {
  name: string;
}

export interface TaskData extends Record<string, unknown>, Lighting {
  task: TaskItem;
  /** Its page is open, or one of its runs. */
  focused: boolean;
}

export interface EditorData extends Record<string, unknown>, Lighting {
  /** Every editor run recorded, and the newest of them. */
  runCount: number;
  latest: TaskItem | null;
  focused: boolean;
}

export interface BatchData extends Record<string, unknown> {
  /** When its newest run started. */
  at: number;
  runs: number;
  failed: number;
}

export interface RunData extends Record<string, unknown>, Lighting {
  run: RunItem;
  focused: boolean;
}

/** The line under the runs: how many older ones Runs has, or, with none at all, how to make one. */
export interface OlderData extends Record<string, unknown> {
  count: number;
}

export type CanvasNode =
  | Node<HeadingData, "heading">
  | Node<SectionData, "section">
  | Node<FolderData, "folder">
  | Node<TaskData, "task">
  | Node<EditorData, "editor">
  | Node<BatchData, "batch">
  | Node<RunData, "run">
  | Node<OlderData, "older">;

/** A node before the layout gives it its place. */
type Unplaced = CanvasNode extends infer N
  ? N extends CanvasNode
    ? Omit<N, "position">
    : never
  : never;

export interface EdgeData extends Record<string, unknown>, Lighting {
  /** The run at its end failed. */
  failed?: boolean;
}

/** A tree line from a folder to what it holds, or a run's link to its task. */
export type CanvasEdge = Edge<EdgeData, "tree"> | Edge<EdgeData, "link">;

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------

/** What the open page is about, which the canvas marks and brings into view. */
export interface Focus {
  source?: SourceKey;
  runId?: number;
}

/** What the pointer is over: a task (or the Editor) or a run, whose ties light up. */
export type Hover = { source: SourceKey } | { runId: number } | null;

export interface LayoutInput {
  tasks: TaskItem[];
  /** The newest runs of every task, newest first. */
  runs: RunItem[];
  /** Every run recorded, for the "older runs" line. */
  totalRuns: number;
  focus: Focus;
  hover: Hover;
}

// -----------------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------------

export function layout(input: LayoutInput): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const spot = spotlight(input);
  const light = (lit: boolean): Lighting => ({ lit, dim: spot.dims && !lit });

  // ---- Tasks ----

  const { x: tx, w: tw } = SIZE.tasks;
  let y = 0;

  nodes.push(heading("tasks", "Tasks", "What ngn run runs", tx, tw));
  y += SIZE.heading.h;

  const section = (key: string, title: string, note: string) => {
    if (y > SIZE.heading.h) y += SECTION_GAP;
    nodes.push({
      id: nodeId.section(key),
      type: "section",
      position: { x: tx, y },
      width: tw,
      height: SIZE.section.h,
      ...STATIC,
      data: { title, note },
    });
    y += SIZE.section.h;
  };

  /** A row of the tree, `depth` levels in, with a line from its parent folder. */
  const place = (node: Unplaced, depth: number, parent: string | null) => {
    const x = tx + depth * INDENT;
    nodes.push({
      ...node,
      position: { x, y },
      width: tw - (x - tx),
      height: SIZE.row.h,
    } as CanvasNode);
    if (parent) edges.push(treeEdge(parent, node.id, spot.lit.has(node.id)));
    y += SIZE.row.h;
  };

  const scheduled = input.tasks.filter((task) => !task.editor);
  const editor = input.tasks.filter((task) => task.editor);

  section("scheduled", "Scheduled", "task files in your project");
  const walk = (dir: Dir, depth: number, parent: string | null) => {
    for (const sub of dir.dirs) {
      const id = nodeId.folder(sub.path);
      place(
        { id, type: "folder", ...STATIC, data: { name: sub.name, ...light(spot.lit.has(id)) } },
        depth,
        parent,
      );
      walk(sub, depth + 1, id);
    }
    for (const task of dir.tasks) {
      const id = nodeId.source(task.id);
      place(
        {
          id,
          type: "task",
          data: { task, focused: input.focus.source === task.id, ...light(spot.lit.has(id)) },
        },
        depth,
        parent,
      );
    }
  };
  walk(tree(scheduled), 0, null);

  section("editor", "Editor", "code run once, from the Editor");
  const editorId = nodeId.source("editor");
  place(
    {
      id: editorId,
      type: "editor",
      data: {
        runCount: editor.reduce((sum, task) => sum + task.run_count, 0),
        latest: newest(editor),
        focused: input.focus.source === "editor",
        ...light(spot.lit.has(editorId)),
      },
    },
    0,
    null,
  );

  // ---- Runs ----

  const { x: rx, w: rw } = SIZE.runs;
  const sourceIds = new Set(
    nodes.filter((n) => n.type === "task" || n.type === "editor").map((n) => n.id),
  );
  y = 0;
  nodes.push(heading("runs", "Runs", "Each time a task ran, newest first", rx, rw));
  y += SIZE.heading.h;

  if (input.runs.length === 0) {
    nodes.push({
      id: nodeId.older(),
      type: "older",
      position: { x: rx, y },
      width: rw,
      height: SIZE.batch.h,
      ...STATIC,
      data: { count: 0 },
    });
  }

  batches(input.runs).forEach((batch, index) => {
    nodes.push({
      id: nodeId.batch(index),
      type: "batch",
      position: { x: rx, y },
      width: rw,
      height: SIZE.batch.h,
      ...STATIC,
      data: {
        at: batch[0]!.at,
        runs: batch.length,
        failed: batch.filter((run) => run.status === "failure").length,
      },
    });
    y += SIZE.batch.h;
    for (const run of batch) {
      const id = nodeId.run(run.id);
      const lit = spot.lit.has(id);
      nodes.push({
        id,
        type: "run",
        position: { x: rx, y },
        width: rw,
        height: SIZE.run.h,
        data: { run, focused: input.focus.runId === run.id, ...light(lit) },
      });
      const from = nodeId.source(sourceOf(run));
      if (sourceIds.has(from)) {
        edges.push({
          id: `link:${run.id}`,
          type: "link",
          source: from,
          sourceHandle: "out",
          target: id,
          targetHandle: "in",
          ...EDGE,
          zIndex: lit ? 1 : 0,
          data: { failed: run.status === "failure", ...light(lit) },
        });
      }
      y += SIZE.run.h + SIZE.run.gap;
    }
  });

  const older = input.totalRuns - input.runs.length;
  if (older > 0) {
    nodes.push({
      id: nodeId.older(),
      type: "older",
      position: { x: rx, y: y + 6 },
      width: rw,
      height: SIZE.batch.h,
      data: { count: older },
    });
  }

  return { nodes, edges };
}

/** Nodes that only label something: nothing to click or focus. */
const STATIC = { selectable: false, focusable: false } as const;
const EDGE = { selectable: false, focusable: false, interactionWidth: 0 } as const;

function heading(
  column: "tasks" | "runs",
  title: string,
  note: string,
  x: number,
  w: number,
): CanvasNode {
  return {
    id: nodeId.heading(column),
    type: "heading",
    position: { x, y: 0 },
    width: w,
    height: SIZE.heading.h,
    ...STATIC,
    data: { title, note },
  };
}

function treeEdge(parent: string, child: string, lit: boolean): CanvasEdge {
  return {
    id: `tree:${child}`,
    type: "tree",
    source: parent,
    sourceHandle: "tree-out",
    target: child,
    targetHandle: "tree-in",
    ...EDGE,
    data: { lit, dim: false },
  };
}

/** The editor task that ran last. */
function newest(tasks: TaskItem[]): TaskItem | null {
  let best: TaskItem | null = null;
  for (const task of tasks) {
    if (
      task.last_run_at != null &&
      (best?.last_run_at == null || task.last_run_at > best.last_run_at)
    )
      best = task;
  }
  return best;
}

/** What a run is tied to on the canvas. */
export function sourceOf(run: Pick<RunItem, "task_id" | "editor">): SourceKey {
  return run.editor ? "editor" : run.task_id;
}

// -----------------------------------------------------------------------------
// The spotlight: what the pointer is over, else what the open page is about
// -----------------------------------------------------------------------------

/**
 * The node ids tied to what the pointer is over, or to what the open page is
 * about when it is over nothing: a task, its runs, and the folders above it;
 * or a run, its task and those folders. Only hovering dims the rest: the open
 * page's focus stays for as long as the page is open, and the canvas should be
 * plain to read when you close it.
 */
export function spotlight(input: Pick<LayoutInput, "focus" | "hover" | "runs" | "tasks">): {
  lit: Set<string>;
  dims: boolean;
} {
  const lit = new Set<string>();
  const target: Hover =
    input.hover ??
    (input.focus.runId != null
      ? { runId: input.focus.runId }
      : input.focus.source != null
        ? { source: input.focus.source }
        : null);
  if (!target) return { lit, dims: false };

  let key: SourceKey;
  if ("runId" in target) {
    const run = input.runs.find((r) => r.id === target.runId);
    lit.add(nodeId.run(target.runId));
    if (!run) return { lit, dims: input.hover != null };
    key = sourceOf(run);
  } else {
    key = target.source;
    for (const run of input.runs) if (sourceOf(run) === key) lit.add(nodeId.run(run.id));
  }
  lit.add(nodeId.source(key));
  const task = key === "editor" ? undefined : input.tasks.find((t) => t.id === key);
  if (task) for (const dir of ancestors(task.path)) lit.add(nodeId.folder(dir));
  return { lit, dims: input.hover != null };
}

/** `tasks/api/a.ts` → `tasks/`, `tasks/api/`. */
function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => `${parts.slice(0, i + 1).join("/")}/`);
}

// -----------------------------------------------------------------------------
// Tasks as a tree of their folders
// -----------------------------------------------------------------------------

export interface Dir {
  /** `api/` */
  name: string;
  /** `tasks/api/`, which is also how its node is keyed. */
  path: string;
  dirs: Dir[];
  tasks: TaskItem[];
}

/**
 * The tasks' folders as a tree, as a file browser lists them: folders first,
 * then files, each by name.
 */
export function tree(tasks: TaskItem[]): Dir {
  const root: Dir = { name: "", path: "", dirs: [], tasks: [] };
  for (const task of tasks) {
    let dir = root;
    for (const part of task.path.split("/").slice(0, -1)) {
      const path = `${dir.path}${part}/`;
      let next = dir.dirs.find((d) => d.path === path);
      if (!next) {
        next = { name: `${part}/`, path, dirs: [], tasks: [] };
        dir.dirs.push(next);
      }
      dir = next;
    }
    dir.tasks.push(task);
  }
  sortDir(root);
  return root;
}

function sortDir(dir: Dir) {
  dir.dirs.sort((a, b) => a.name.localeCompare(b.name));
  dir.tasks.sort((a, b) => a.file.localeCompare(b.file));
  dir.dirs.forEach(sortDir);
}

// -----------------------------------------------------------------------------
// Runs: in batches
// -----------------------------------------------------------------------------

/**
 * Runs, newest first, cut wherever one started more than {@link BATCH_GAP_MS}
 * before the one after it. Runs that went off together (a burst of ticks, a
 * restart) land as one batch, a run on its own as a batch of one.
 */
export function batches(runs: RunItem[]): RunItem[][] {
  const out: RunItem[][] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && prev.at - run.at <= BATCH_GAP_MS) last.push(run);
    else out.push([run]);
  }
  return out;
}
