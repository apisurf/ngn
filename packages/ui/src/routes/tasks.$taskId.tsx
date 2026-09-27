// A task: one file, across every run of it.
//
// The header — what the file is, its schedule, its hooks, how it is doing —
// stays put; below it is either the task's own tabs (its run history first)
// or one run of it, picked from that history.
//
// The schedule and hooks are read out of the newest version's compiled code:
// ngn keeps them nowhere else.

import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { css, cx } from "styled-system/css";
import { IconClock, IconCode, IconTask } from "~/components/icons";
import { mono, Pill, truncate } from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatAgo } from "~/lib/format";
import { cronOf, describeCron, hooksOf, runTone } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import type { TaskPage as TaskPageData } from "~/server/api";
import { getTask } from "~/server/api";

export const Route = createFileRoute("/tasks/$taskId")({
  loader: async ({ params }) => {
    const page = await getTask({ data: { taskId: params.taskId } });
    if (!page) throw notFound();
    return page;
  },
  component: TaskLayout,
});

function TaskLayout() {
  const page = Route.useLoaderData();
  const unreadable = useUnreadable();
  const now = useNow(Date.now(), 60_000);
  if (unreadable) return unreadable;

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <TaskHeader page={page} now={now} />
      <Outlet />
    </div>
  );
}

function TaskHeader({ page, now }: { page: TaskPageData; now: number }) {
  const { task, latest } = page;
  const cron = cronOf(latest?.compiled_code);
  const cadence = cron ? describeCron(cron) : null;
  const hooks = hooksOf(latest?.compiled_code);

  return (
    <header className={css({ px: "5", pt: "4", pb: "3", flexShrink: 0 })}>
      <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
        <span className={css({ color: "muted", display: "inline-flex" })}>
          {task.live ? <IconCode size={18} /> : <IconTask size={18} />}
        </span>
        <h1 className={cx(truncate, css({ fontSize: "18px", fontWeight: "600", m: "0" }))}>
          {task.live ? "Live editor task" : task.file}
        </h1>
        {task.last_outcome ? (
          <Pill tone={runTone(task.last_outcome)}>
            {task.last_outcome === "failure" ? "Failing" : "Healthy"}
          </Pill>
        ) : null}
        {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
        {task.version ? <Pill title="Newest version">v{task.version}</Pill> : null}
      </div>
      <div
        className={css({
          display: "flex",
          gap: "2",
          mt: "1",
          color: "muted",
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: "12px",
        })}
      >
        <span className={mono} title="Path relative to the project root">
          {task.path}
        </span>
        {cron ? (
          <>
            <span>·</span>
            <span
              className={css({ display: "inline-flex", alignItems: "center", gap: "1" })}
              title="The `timing` export of the newest version"
            >
              <IconClock size={12} />
              <span className={mono}>{cron}</span>
              {cadence ? <span className={css({ color: "faint" })}>({cadence})</span> : null}
            </span>
          </>
        ) : null}
        {task.last_run_at ? (
          <>
            <span>·</span>
            <span>last ran {formatAgo(now, task.last_run_at)}</span>
          </>
        ) : null}
        {hooks.length ? (
          <>
            <span>·</span>
            {hooks.map((hook) => (
              <Pill key={hook} title="Exported hook">
                {hook}
              </Pill>
            ))}
          </>
        ) : null}
      </div>
    </header>
  );
}
