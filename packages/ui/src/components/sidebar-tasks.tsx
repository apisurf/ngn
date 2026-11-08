// Tasks: every task file the scheduler recorded. A task's runs are on its
// page, in its history; the sidebar only picks the task.
//
// Tasks are grouped under the folder they live in (relative to the project
// root), most recently run first within each group. Code sent from the Editor
// is recorded as a task too, but those are editor runs, not the project's
// tasks: they are found on the Editor page and under Runs, never here.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { useActive } from "~/lib/active";
import { formatAgo, plural } from "~/lib/format";
import { circuitOpen } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTabs } from "~/lib/tabs";
import type { TaskItem } from "~/server/api";
import { IconTask, IconPause } from "./icons";
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

export function TasksPanel() {
  const ws = root.useLoaderData();
  const active = useActive();
  const [filter, setFilter] = React.useState("");
  const projectTasks = React.useMemo(() => ws.tasks.filter((task) => !task.editor), [ws.tasks]);

  const needle = filter.trim().toLowerCase();
  const groups = React.useMemo(() => {
    const byDir = new Map<string, TaskItem[]>();
    for (const task of projectTasks) {
      if (needle && !task.path.toLowerCase().includes(needle)) continue;
      const list = byDir.get(task.dir) ?? [];
      list.push(task);
      byDir.set(task.dir, list);
    }
    return [...byDir.entries()].toSorted(([a], [b]) => a.localeCompare(b));
  }, [projectTasks, needle]);

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <div className={css({ px: "2.5", pb: "2", flexShrink: 0 })}>
        <FilterInput
          placeholder="Filter tasks"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", px: "1.5", pb: "3" })}>
        {groups.length === 0 ? (
          <Empty
            title={projectTasks.length === 0 ? "No tasks yet" : "No matches"}
            icon={<IconTask size={20} />}
          >
            {projectTasks.length === 0
              ? "Every task file ngn run schedules shows up here."
              : "No task path matches the filter."}
          </Empty>
        ) : (
          groups.map(([dir, tasks]) => (
            <div key={dir} className={css({ mb: "2" })}>
              {dir ? (
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

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: String(task.id) }}
      data-active={active}
      className={cx(treeRow, css({ pl: "2" }))}
      onDoubleClick={() => pin(tabKey.task(task.id))}
      title={`${task.path} · ${plural(task.run_count, "run")}${
        task.last_run_at ? ` · last ran ${formatAgo(now, task.last_run_at)}` : ""
      }`}
    >
      <span className={css({ color: "muted", display: "inline-flex" })}>
        <IconTask size={14} />
      </span>
      <span className={cx(truncate, css({ flex: "1", fontWeight: "500" }))}>{task.file}</span>
      {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
      {task.schedule?.state === "paused" ? (
        <span
          title="Paused: no runs until resumed"
          className={css({ color: "muted", display: "inline-flex" })}
        >
          <IconPause size={12} />
        </span>
      ) : null}
      <Health task={task} />
    </Link>
  );
}

/**
 * What needs looking at, as one mark: failing or circuit open (red), Stalled
 * (amber). A healthy task shows nothing — the quiet default.
 */
function Health({ task }: { task: TaskItem }) {
  if (circuitOpen(task)) return <Dot tone="bad" title="Circuit open: ngn is skipping its ticks" />;
  if (task.last_outcome === "failure") return <Dot tone="bad" title="Latest run failed" />;
  if (task.stalled_run_id != null) {
    return <Dot tone="warn" title={`Stalled: run #${task.stalled_run_id} will not finish`} />;
  }
  return null;
}
