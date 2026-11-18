// What the canvas draws: the column headings, the tasks tree (sections,
// folders, tasks, the Editor), the runs (batch headers, runs), and the lines
// between them.
//
// Every node is drawn at the size the layout gave it. Clicking a task, the
// Editor or a run opens it as a layer over the canvas (the canvas handles that,
// in one place); a row's own button (Run now, the older-runs link) does its own
// thing.

import { getRouteApi } from "@tanstack/react-router";
import type { Edge, EdgeProps, NodeProps } from "@xyflow/react";
import { BaseEdge, getBezierPath, Handle, Position } from "@xyflow/react";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { IconCode, IconPause, IconPlay, IconTask } from "~/components/icons";
import { Dot, mono, Pill, toneText, truncate } from "~/components/primitives";
import { formatAgo, formatMs, plural } from "~/lib/format";
import { circuitOpen, isOpen, readSkip, runMark, runStateLabel, runTone } from "~/lib/ngn";
import { useNow, usePrefs } from "~/lib/prefs";
import type { TaskItem } from "~/server/api";
import { runTask } from "~/server/api";
import { useCanvasActions } from "./context";
import type { CanvasNode, EdgeData } from "./layout";

const root = getRouteApi("__root__");

type Props<T extends CanvasNode["type"]> = NodeProps<Extract<CanvasNode, { type: T }>>;

// -----------------------------------------------------------------------------
// Shared pieces
// -----------------------------------------------------------------------------

/** A line in the tree or the runs column: one height, one look. */
const row = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  w: "full",
  h: "full",
  px: "2",
  rounded: "md",
  fontSize: "12.5px",
  whiteSpace: "nowrap",
  minW: "0",
  transition: "opacity 120ms, background 120ms, border-color 120ms",
  "&[data-dim=true]": { opacity: 0.35 },
});

/** A row that opens something. */
const clickable = css({
  cursor: "pointer",
  _hover: { bg: "hover" },
  "&[data-lit=true], &[data-focused=true]": { bg: "selected" },
});

/** Where lines join a node. Invisible: React Flow only needs to know where. */
const handle = css({
  w: "1px !important",
  h: "1px !important",
  minW: "0 !important",
  minH: "0 !important",
  border: "none !important",
  bg: "transparent !important",
  pointerEvents: "none",
});

/** The point a folder's line leaves from: under the middle of its chevron. */
const TREE_X = 9;

function TreeIn() {
  return <Handle type="target" position={Position.Left} id="tree-in" className={handle} />;
}

function Out() {
  return <Handle type="source" position={Position.Right} id="out" className={handle} />;
}

/** Keeps a click on a row's own control from also opening the row, or panning. */
function Control({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions jsx-a11y/click-events-have-key-events -- only stops the click bubbling to the node
    <div className={cx("nodrag nopan", className)} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

const meta = css({
  ml: "auto",
  color: "faint",
  fontSize: "11.5px",
  fontVariantNumeric: "tabular-nums",
});

const glyph = css({ display: "inline-flex", color: "muted", flexShrink: 0 });

// -----------------------------------------------------------------------------
// Headings and sections
// -----------------------------------------------------------------------------

export function HeadingNode({ data }: Props<"heading">) {
  return (
    <div className={css({ display: "flex", flexDir: "column", gap: "0.5", px: "2" })}>
      <span
        className={css({
          fontSize: "12px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        })}
      >
        {data.title}
      </span>
      <span className={css({ fontSize: "12px", color: "faint" })}>{data.note}</span>
    </div>
  );
}

export function SectionNode({ data }: Props<"section">) {
  return (
    <div
      className={css({
        display: "flex",
        alignItems: "baseline",
        gap: "2",
        px: "2",
        pt: "1.5",
        fontSize: "12px",
      })}
    >
      <span className={css({ fontWeight: "600", color: "muted" })}>{data.title}</span>
      <span className={css({ color: "faint" })}>{data.note}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// The tasks tree
// -----------------------------------------------------------------------------

export function FolderNode({ data }: Props<"folder">) {
  return (
    <div
      className={cx(row, css({ color: data.lit ? "fg" : "muted" }))}
      data-dim={data.dim}
      style={{ paddingLeft: 4 }}
    >
      <TreeIn />
      <span className={css({ color: "faint", fontSize: "9px", w: "10px" })}>▼</span>
      <span className={cx(mono, truncate, css({ fontSize: "12px" }))}>{data.name}</span>
      <Handle
        type="source"
        position={Position.Bottom}
        id="tree-out"
        className={handle}
        style={{ left: TREE_X }}
      />
    </div>
  );
}

export function TaskNode({ data }: Props<"task">) {
  const { task } = data;
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const failing = task.last_outcome === "failure";
  return (
    <div
      className={cx(
        row,
        clickable,
        css({ "& .run": { display: "none" }, "&:hover .run": { display: "flex" } }),
      )}
      data-lit={data.lit}
      data-dim={data.dim}
      data-focused={data.focused}
      title={`${task.path}${task.last_run_at ? ` · last ran ${formatAgo(now, task.last_run_at)}` : ""}`}
    >
      <TreeIn />
      <span className={glyph}>
        <IconTask size={14} />
      </span>
      <span className={cx(truncate, css({ fontWeight: "500" }), failing ? toneText("bad") : null)}>
        {task.file}
      </span>
      {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
      {task.schedule?.state === "paused" ? (
        <span title="Paused: no runs until resumed" className={glyph}>
          <IconPause size={12} />
        </span>
      ) : null}
      <span className={meta}>{task.run_count ? task.run_count : "Not run"}</span>
      {ws.live ? (
        <Control className="run">
          <RunNow task={task} />
        </Control>
      ) : null}
      <Health task={task} />
      <Out />
    </div>
  );
}

/**
 * What needs looking at, as one mark: failing or circuit open (red), Stalled
 * (amber), a run going (blue). A healthy, idle task shows nothing.
 */
function Health({ task }: { task: TaskItem }) {
  if (circuitOpen(task)) return <Dot tone="bad" title="Circuit open: ngn is skipping its ticks" />;
  if (task.last_outcome === "failure") return <Dot tone="bad" title="Latest run failed" />;
  if (task.stalled_run_id != null) {
    return <Dot tone="warn" title={`Stalled: run #${task.stalled_run_id} will not finish`} />;
  }
  if (task.last_status && isOpen(task.last_status)) {
    return <Dot tone="info" title={`Run #${task.last_run_id} is going`} />;
  }
  return null;
}

/** Start a run of the task now, in the running `ngn run`, from its row. */
function RunNow({ task }: { task: TaskItem }) {
  const ws = root.useLoaderData();
  const { set, refresh } = usePrefs();
  const [state, setState] = React.useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const start = async () => {
    setState({ busy: true, error: null });
    try {
      const outcome = await runTask({ data: { token: ws.token, taskId: task.id } });
      setState({ busy: false, error: outcome.ok ? null : outcome.error });
      if (outcome.ok) {
        set("follow", true);
        refresh();
      }
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <button
      type="button"
      disabled={state.busy}
      aria-label={`Run ${task.file} now`}
      title={state.error ?? "Run now, in the running ngn run"}
      onClick={() => void start()}
      className={cx(
        css({
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          w: "20px",
          h: "20px",
          rounded: "sm",
          border: "none",
          bg: "transparent",
          color: "accent",
          cursor: "pointer",
          _hover: { bg: "accentSoft" },
          _disabled: { opacity: 0.5, cursor: "default" },
        }),
        state.error ? toneText("bad") : null,
      )}
    >
      <IconPlay size={12} />
    </button>
  );
}

export function EditorNode({ data }: Props<"editor">) {
  const { latest, runCount } = data;
  return (
    <div
      className={cx(row, clickable)}
      data-lit={data.lit}
      data-dim={data.dim}
      data-focused={data.focused}
      title="The Editor: run code once, in this project's ngn run"
    >
      <TreeIn />
      <span className={glyph}>
        <IconCode size={14} />
      </span>
      <span className={css({ fontWeight: "500" })}>Editor runs</span>
      <span className={meta}>{runCount ? runCount : "Not run"}</span>
      {latest?.last_status ? (
        <Dot
          tone={runMark(latest.last_status, latest.stalled_run_id === latest.last_run_id)}
          title={`Latest: ${runStateLabel(latest.last_status, false).toLowerCase()}`}
        />
      ) : null}
      <Out />
    </div>
  );
}

// -----------------------------------------------------------------------------
// The runs column
// -----------------------------------------------------------------------------

export function BatchNode({ data }: Props<"batch">) {
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 30_000);
  return (
    <div
      className={css({
        display: "flex",
        alignItems: "flex-end",
        gap: "2",
        h: "28px",
        px: "1",
        pb: "1",
        fontSize: "11.5px",
        color: "faint",
        borderBottom: "1px solid {colors.line}",
      })}
    >
      <span
        className={css({ color: "muted", fontWeight: "600" })}
        title={new Date(data.at).toLocaleString()}
      >
        {formatAgo(now, data.at)}
      </span>
      <span>{plural(data.runs, "run")}</span>
      {data.failed ? (
        <span className={cx(toneText("bad"), css({ fontWeight: "600" }))}>
          {data.failed} failed
        </span>
      ) : null}
    </div>
  );
}

export function RunNode({ data }: Props<"run">) {
  const { run } = data;
  const tone = runTone(run.status, run.stalled);
  const bad = run.status === "failure";
  return (
    <div
      className={cx(
        row,
        css({
          bg: "raised",
          border: "1px solid",
          borderColor: "line",
          cursor: "pointer",
          _hover: { borderColor: "lineStrong" },
          "&[data-bad=true]": {
            bg: "badSoft",
            borderColor: "color-mix(in srgb, {colors.bad} 40%, {colors.line})",
          },
          "&[data-lit=true], &[data-focused=true]": {
            borderColor: "accent",
            boxShadow: "0 0 0 2px {colors.accentSoft}",
          },
        }),
      )}
      data-bad={bad}
      data-lit={data.lit}
      data-dim={data.dim}
      data-focused={data.focused}
      title={`${run.path} · ${new Date(run.at).toLocaleString()}`}
    >
      <Handle type="target" position={Position.Left} id="in" className={handle} />
      <Dot tone={runMark(run.status, run.stalled)} />
      <span className={cx(mono, css({ fontWeight: "600", fontSize: "11.5px" }))}>#{run.id}</span>
      <span className={cx(truncate, css({ color: "muted" }))}>
        {run.editor ? "Editor run" : run.file}
      </span>
      {run.status !== "success" ? (
        <span
          className={cx(
            tone === "neutral" ? css({ color: "muted" }) : toneText(tone),
            css({ fontWeight: "600", fontSize: "11.5px" }),
          )}
        >
          {runStateLabel(run.status, run.stalled)}
        </span>
      ) : null}
      <span className={meta}>
        {run.status === "skipped"
          ? readSkip(run.skip_reason).short
          : run.duration_ms != null
            ? formatMs(run.duration_ms)
            : null}
      </span>
    </div>
  );
}

export function OlderNode({ data }: Props<"older">) {
  const { open } = useCanvasActions();
  if (data.count === 0) {
    return (
      <div className={css({ px: "2", pt: "2", fontSize: "12.5px", color: "muted" })}>
        No runs yet. Start <code className={mono}>ngn run</code> in the project, or run a task from
        the left.
      </div>
    );
  }
  return (
    <Control>
      <button
        type="button"
        onClick={() => open("/runs")}
        className={css({
          px: "2",
          py: "1",
          border: "none",
          bg: "transparent",
          color: "accent",
          fontSize: "12.5px",
          cursor: "pointer",
          _hover: { textDecoration: "underline" },
        })}
      >
        {plural(data.count, "older run")} in Runs →
      </button>
    </Control>
  );
}

// -----------------------------------------------------------------------------
// Lines
// -----------------------------------------------------------------------------

type LineProps = EdgeProps<Edge<EdgeData>>;

/** A folder's line down to a row it holds: down, a small round corner, across. */
export function TreeEdge({ id, sourceX, sourceY, targetX, targetY, data }: LineProps) {
  const r = 4;
  const x = sourceX;
  const path = `M ${x} ${sourceY - 4} V ${targetY - r} Q ${x} ${targetY} ${x + r} ${targetY} H ${targetX + 2}`;
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: data?.lit ? "var(--colors-accent)" : "var(--colors-line-strong)",
        strokeWidth: 1,
        fill: "none",
      }}
    />
  );
}

/** A run's tie to its task: faint, unless one end is in the spotlight. */
export function LinkEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: LineProps) {
  const [path] = getBezierPath({
    sourceX: sourceX + 4,
    sourceY,
    sourcePosition,
    targetX: targetX - 4,
    targetY,
    targetPosition,
  });
  const lit = data?.lit ?? false;
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: lit
          ? "var(--colors-accent)"
          : data?.failed
            ? "var(--colors-bad)"
            : "var(--colors-line-strong)",
        strokeWidth: lit ? 1.6 : 1,
        opacity: lit ? 1 : data?.dim ? 0.1 : data?.failed ? 0.5 : 0.7,
        fill: "none",
        transition: "opacity 120ms",
      }}
    />
  );
}
