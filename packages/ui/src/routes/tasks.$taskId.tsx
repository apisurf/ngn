// A task: one file, across every run of it.
//
// The header — what the file is, its schedule, its hooks, how it is doing —
// stays put; below it is either the task's own tabs (its run history first)
// or one run of it, picked from that history.
//
// The schedule, the exports that shape how it runs (retry, budget, overlap,
// exclusive locks) and its hooks are read out of the newest version's
// compiled code: ngn keeps them nowhere else.

import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { css, cx } from "styled-system/css";
import { IconClock, IconCode, IconTask } from "~/components/icons";
import { mono, Pill, truncate } from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatAgo } from "~/lib/format";
import { circuitOpen, configOf, cronOf, describeCron, hooksOf } from "~/lib/ngn";
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
  const code = latest?.compiled_code;
  const cron = cronOf(code);
  const cadence = cron ? describeCron(cron) : null;
  const open = circuitOpen(task);

  return (
    <header className={css({ px: "5", pt: "4", pb: "3", flexShrink: 0 })}>
      <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
        <span className={css({ color: "faint", display: "inline-flex" })}>
          {task.live ? <IconCode size={18} /> : <IconTask size={18} />}
        </span>
        <h1 className={cx(truncate, css({ fontSize: "18px", fontWeight: "600", m: "0" }))}>
          {task.live ? "Live editor task" : task.file}
        </h1>
        {/* Only a state that needs attention gets a pill; healthy is the quiet default. */}
        {open ? (
          <Pill tone="bad" title="ngn is skipping ticks after repeated failures">
            Circuit open
          </Pill>
        ) : task.last_outcome === "failure" ? (
          <Pill tone="bad" title="Its latest run that reached a verdict failed">
            Failing
          </Pill>
        ) : null}
        {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
      </div>
      <div className={line}>
        <span className={mono} title="Path relative to the project root">
          {task.path}
        </span>
        {cron ? (
          <span
            className={css({ display: "inline-flex", alignItems: "center", gap: "1" })}
            title={`timing = "${cron}"`}
          >
            <IconClock size={12} />
            {cadence ?? <span className={mono}>{cron}</span>}
          </span>
        ) : null}
        {task.last_run_at ? <span>last ran {formatAgo(now, task.last_run_at)}</span> : null}
      </div>
      <Behaviour code={code} />
    </header>
  );
}

const line = css({
  display: "flex",
  columnGap: "4",
  rowGap: "1",
  mt: "1",
  color: "muted",
  flexWrap: "wrap",
  alignItems: "center",
  fontSize: "12px",
});

/**
 * How the task asked to be run, beyond its schedule: each export that changes
 * what ngn does, in a word or two. Nothing at all for a task on the defaults.
 */
function Behaviour({ code }: { code: string | null | undefined }) {
  const config = configOf(code);
  const hooks = hooksOf(code);
  const { retry } = config;
  const items: { label: string; value: string; title: string }[] = [];

  if (retry && retry.attempts > 1) {
    items.push({
      label: "retry",
      value: `${retry.attempts}×${retry.delay ? `, ${retry.delay} apart` : ""}`,
      title: "Tries per tick, the first included; a retry never runs into the next tick",
    });
  }
  if (retry?.breaker) {
    items.push({
      label: "breaker",
      value: `after ${retry.breaker.after} failed ticks`,
      title: `Then skips 1, 2, 4… ticks, up to ${retry.breaker.maxSkip}, until one succeeds`,
    });
  }
  if (config.budget) {
    items.push({ label: "budget", value: config.budget, title: "The longest a run should take" });
  }
  if (config.overlap === "allow") {
    items.push({
      label: "overlap",
      value: "allowed",
      title: "A tick starts another run while the last is still going",
    });
  }
  if (config.exclusive.length) {
    items.push({
      label: "exclusive",
      value: config.exclusive.join(", "),
      title: "Locks held for the whole run; a run that cannot take them is skipped",
    });
  }
  for (const name of config.computed) {
    items.push({
      label: name,
      value: "set",
      title: "Exported, but not as a literal ngnui can read",
    });
  }
  if (hooks.length) {
    items.push({ label: "hooks", value: hooks.join(", "), title: "Exported hooks" });
  }
  if (items.length === 0) return null;

  return (
    <div className={line}>
      {items.map((item) => (
        <span key={item.label} title={item.title} className={css({ whiteSpace: "nowrap" })}>
          <span className={css({ color: "faint" })}>{item.label} </span>
          <span className={cx(mono, css({ color: "fg" }))}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}
