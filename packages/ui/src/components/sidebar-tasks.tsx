// Tasks: every task file the scheduler recorded. A task's runs are on its
// page, in its history; the sidebar only picks the task.
//
// Tasks are grouped under the folder they live in (relative to the project
// root), most recently run first within each group. Code sent from the live
// editor is recorded as a task too; those sit in a group of their own at the
// bottom, named by when they ran rather than by their throwaway filename.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { useActive } from "~/lib/active";
import { formatClock, formatDayHeading } from "~/lib/format";
import { useNow } from "~/lib/prefs";
import { tabKey, useTabs } from "~/lib/tabs";
import type { TaskItem } from "~/server/api";
import { IconCode, IconTask } from "./icons";
import { Dot, Empty, FilterInput, Pill, truncate } from "./primitives";

const root = getRouteApi("__root__");

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
              ? "Every task file ngn run schedules shows up here."
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
                <TaskNode key={task.id} task={task} active={active.taskId === task.id} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskNode({ task, active }: { task: TaskItem; active: boolean }) {
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const { pin } = useTabs();
  // A live-editor task's filename is a timestamp; when it ran says the same, readably.
  const ranAt = task.live ? task.last_run_at : null;

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: String(task.id) }}
      data-active={active}
      className={cx(treeRow, css({ pl: "2" }))}
      onDoubleClick={() => pin(tabKey.task(task.id))}
      title={ranAt ? `${task.path} · ${formatDayHeading(now, ranAt)}` : task.path}
    >
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
        title={`${task.run_count} runs`}
      >
        {task.run_count}
      </span>
    </Link>
  );
}
