// Tasks: every task file, its recent runs under it — the tree the scheduler
// is, built from what it actually recorded.
//
// Tasks are grouped under the folder they live in (relative to the project
// root), most recently run first within each group. Code sent from the live
// editor is recorded as a task too; those sit in a group of their own at the
// bottom, named by when they ran rather than by their throwaway filename.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { useActive } from "~/lib/active";
import { formatClock, formatDayHeading, formatMs } from "~/lib/format";
import { runTone } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTabs } from "~/lib/tabs";
import type { RunItem, TaskItem } from "~/server/api";
import { IconChevronDown, IconChevronRight, IconCode, IconTask } from "./icons";
import { Dot, Empty, FilterInput, mono, Pill, truncate } from "./primitives";

const root = getRouteApi("__root__");

/** Runs shown under a task before "show more". */
const RUNS_SHOWN = 8;

export const treeRow = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  h: "26px",
  pr: "2",
  rounded: "sm",
  cursor: "pointer",
  color: "fg",
  textDecoration: "none",
  userSelect: "none",
  minW: "0",
  _hover: { bg: "hover" },
  "&[data-active=true]": { bg: "selected" },
});

const chevron = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "16px",
  h: "16px",
  color: "faint",
  flexShrink: 0,
  rounded: "xs",
  border: "none",
  bg: "transparent",
  p: "0",
  cursor: "pointer",
  _hover: { color: "fg", bg: "hover" },
});

const groupHeading = css({
  fontSize: "10.5px",
  color: "faint",
  px: "2",
  pt: "1.5",
  pb: "0.5",
  fontFamily: "mono",
});

/** The heading live-editor tasks are grouped under. */
const LIVE_GROUP = "\0live";

export function TasksPanel({ filterRef }: { filterRef: React.RefObject<HTMLInputElement | null> }) {
  const ws = root.useLoaderData();
  const active = useActive();
  const [filter, setFilter] = React.useState("");
  const [open, setOpen] = React.useState<Set<number>>(() => new Set());

  // Open the tree down to whatever is on screen.
  React.useEffect(() => {
    if (active.taskId == null) return;
    const taskId = active.taskId;
    setOpen((current) => (current.has(taskId) ? current : new Set([...current, taskId])));
  }, [active.taskId]);

  const toggle = React.useCallback((taskId: number, force?: boolean) => {
    setOpen((current) => {
      const next = new Set(current);
      const shouldOpen = force ?? !next.has(taskId);
      if (shouldOpen) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }, []);

  const runsByTask = React.useMemo(() => {
    const map = new Map<number, RunItem[]>();
    for (const run of ws.runs) {
      const list = map.get(run.task_id) ?? [];
      list.push(run);
      map.set(run.task_id, list);
    }
    return map;
  }, [ws.runs]);

  const needle = filter.trim().toLowerCase();
  const groups = React.useMemo(() => {
    const byDir = new Map<string, TaskItem[]>();
    for (const task of ws.tasks) {
      if (needle && !task.path.toLowerCase().includes(needle)) continue;
      const key = task.live ? LIVE_GROUP : task.dir;
      const list = byDir.get(key) ?? [];
      list.push(task);
      byDir.set(key, list);
    }
    // Project folders alphabetically; the live editor's scratch runs last.
    return [...byDir.entries()].toSorted(([a], [b]) =>
      a === LIVE_GROUP ? 1 : b === LIVE_GROUP ? -1 : a.localeCompare(b),
    );
  }, [ws.tasks, needle]);

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <div className={css({ px: "2.5", pb: "2", flexShrink: 0 })}>
        <FilterInput
          ref={filterRef}
          placeholder="Filter tasks"
          shortcut="/"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", px: "1.5", pb: "3" })}>
        {groups.length === 0 ? (
          <Empty
            title={ws.tasks.length === 0 ? "No tasks yet" : "No matches"}
            icon={<IconTask size={20} />}
          >
            {ws.tasks.length === 0
              ? "Every task file ngn run schedules shows up here with its runs."
              : "No task path matches the filter."}
          </Empty>
        ) : (
          groups.map(([dir, tasks]) => (
            <div key={dir} className={css({ mb: "2" })}>
              {dir === LIVE_GROUP ? (
                <div className={cx(groupHeading, css({ fontFamily: "body" }))}>Live editor</div>
              ) : dir ? (
                <div title={dir} className={cx(truncate, groupHeading)}>
                  {dir}
                </div>
              ) : null}
              {tasks.map((task) => (
                <TaskNode
                  key={task.id}
                  task={task}
                  runs={runsByTask.get(task.id) ?? []}
                  expanded={open.has(task.id)}
                  toggle={toggle}
                  active={active}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskNode({
  task,
  runs,
  expanded,
  toggle,
  active,
}: {
  task: TaskItem;
  runs: RunItem[];
  expanded: boolean;
  toggle: (taskId: number, force?: boolean) => void;
  active: ReturnType<typeof useActive>;
}) {
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const { pin } = useTabs();
  const isActive = active.taskId === task.id && active.runId == null;
  // A live-editor task's filename is a timestamp; when it ran says the same, readably.
  const ranAt = task.live ? task.last_run_at : null;

  return (
    <div>
      <Link
        to="/tasks/$taskId"
        params={{ taskId: String(task.id) }}
        data-active={isActive}
        className={cx(treeRow, css({ pl: "1" }))}
        onClick={() => toggle(task.id, true)}
        onDoubleClick={() => pin(tabKey.task(task.id))}
        title={ranAt ? `${task.path} · ${formatDayHeading(now, ranAt)}` : task.path}
      >
        {/* A span, not a button: interactive content cannot nest inside a link. */}
        <span
          role="button"
          tabIndex={-1}
          className={chevron}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(task.id);
          }}
        >
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className={css({ color: "muted", display: "inline-flex" })}>
          {task.live ? <IconCode size={14} /> : <IconTask size={14} />}
        </span>
        <span className={cx(truncate, css({ flex: "1", fontWeight: "500" }))}>
          {ranAt ? `Run at ${formatClock(ranAt)}` : task.file}
        </span>
        {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
        {task.last_outcome === "failure" ? <Dot tone="bad" title="Latest run failed" /> : null}
        <span
          className={css({ fontSize: "11px", color: "faint", fontVariantNumeric: "tabular-nums" })}
        >
          {task.run_count}
        </span>
      </Link>
      {expanded ? <TaskRuns task={task} runs={runs} activeRunId={active.runId} now={now} /> : null}
    </div>
  );
}

const moreRow = cx(
  treeRow,
  css({
    pl: "9",
    border: "none",
    bg: "transparent",
    w: "full",
    color: "accent",
    fontSize: "12px",
  }),
);

function TaskRuns({
  task,
  runs,
  activeRunId,
  now,
}: {
  task: TaskItem;
  runs: RunItem[];
  activeRunId: number | null;
  now: number;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? runs : runs.slice(0, RUNS_SHOWN);

  if (task.run_count === 0) {
    return (
      <div className={cx(treeRow, css({ pl: "9", color: "faint", fontSize: "12px" }))}>
        Never ran
      </div>
    );
  }
  return (
    <div>
      {shown.map((run) => (
        <RunNode key={run.id} run={run} active={activeRunId === run.id} now={now} />
      ))}
      {runs.length > shown.length ? (
        <button type="button" onClick={() => setShowAll(true)} className={moreRow}>
          Show {runs.length - shown.length} older runs
        </button>
      ) : task.run_count > shown.length ? (
        // Past the sidebar's window of runs, the task page has the rest.
        <Link to="/tasks/$taskId" params={{ taskId: String(task.id) }} className={moreRow}>
          All {task.run_count} runs
        </Link>
      ) : null}
    </div>
  );
}

function RunNode({ run, active, now }: { run: RunItem; active: boolean; now: number }) {
  const { pin } = useTabs();
  const day = formatDayHeading(now, run.at);

  return (
    <Link
      to="/runs/$runId"
      params={{ runId: String(run.id) }}
      data-active={active}
      className={cx(treeRow, css({ pl: "6" }))}
      onDoubleClick={() => pin(tabKey.run(run.id))}
      title={`Run ${run.id} · ${run.status}`}
    >
      <Dot tone={runTone(run.status)} />
      <span className={cx(truncate, css({ flex: "1" }))}>
        <span className={css({ color: "muted" })}>{day === "Today" ? "" : `${day} `}</span>
        <span className={mono}>{formatClock(run.at)}</span>
      </span>
      {run.error_count ? (
        <span className={css({ fontSize: "11px", color: "bad" })}>{run.error_count}✕</span>
      ) : null}
      <span className={cx(mono, css({ fontSize: "11px", color: "faint" }))}>
        {run.duration_ms != null
          ? formatMs(run.duration_ms)
          : run.status === "skipped"
            ? "skip"
            : "…"}
      </span>
    </Link>
  );
}
