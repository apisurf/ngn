// A task: one file, across every run of it.
//
// The header — what the file is, its schedule, its hooks, how it is doing —
// stays put; below it is either the task's own tabs (its run history first)
// or one run of it, picked from that history.
//
// The schedule, the exports that shape how it runs (retry, budget, overlap,
// exclusive locks) and its hooks are read out of the newest version's
// compiled code: ngn keeps them nowhere else.

import { createFileRoute, Link, notFound, Outlet, useParams } from "@tanstack/react-router";
import { Breadcrumb, crumbLink } from "~/components/breadcrumb";
import { css, cx } from "styled-system/css";
import { IconClock, IconCode, IconTask } from "~/components/icons";
import { mono, Pill, truncate } from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatAgo } from "~/lib/format";
import {
  circuitOpen,
  configOf,
  cronOf,
  describeCron,
  hooksOf,
  readSkip,
  runStateLabel,
} from "~/lib/ngn";
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

/**
 * An editor run is not one of the project's tasks: its header leads back to the
 * Editor it came from, and says when it was sent rather than naming its
 * throwaway file.
 */
function EditorRunHeader({ page, now }: { page: TaskPageData; now: number }) {
  const { task } = page;
  const runId = useRunId();
  return (
    <header className={css({ px: "5", pt: "4", pb: "3", flexShrink: 0 })}>
      <Breadcrumb>
        <Link to="/live" className={crumbLink} title="Back to the Editor and its recent runs">
          Editor
        </Link>
        {runId ? <span>Run #{runId}</span> : <span>Editor run</span>}
      </Breadcrumb>
      <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
        <span className={css({ color: "faint", display: "inline-flex" })}>
          <IconCode size={18} />
        </span>
        <h1 className={cx(truncate, css({ fontSize: "18px", fontWeight: "600", m: "0" }))}>
          Editor run
        </h1>
      </div>
      <div className={line}>
        <span title={task.path}>
          {task.last_run_at ? `sent ${formatAgo(now, task.last_run_at)}` : "never ran"}
        </span>
      </div>
    </header>
  );
}

/** The run on screen under this task, when a run is. */
function useRunId(): string | undefined {
  return (useParams({ strict: false }) as { runId?: string }).runId;
}

function TaskHeader({ page, now }: { page: TaskPageData; now: number }) {
  const { task, latest } = page;
  const runId = useRunId();
  if (task.editor) return <EditorRunHeader page={page} now={now} />;
  const code = latest?.compiled_code;
  const cron = cronOf(code);
  const cadence = cron ? describeCron(cron) : null;
  const open = circuitOpen(task);

  return (
    <header className={css({ px: "5", pt: "4", pb: "3", flexShrink: 0 })}>
      <Breadcrumb>
        <Link to="/" className={crumbLink} title="Every task, on the Overview">
          Tasks
        </Link>
        {runId ? (
          <Link
            to="/tasks/$taskId"
            params={{ taskId: String(task.id) }}
            className={crumbLink}
            title="The task's runs"
          >
            {task.file}
          </Link>
        ) : (
          <span>{task.file}</span>
        )}
        {runId ? <span>Run #{runId}</span> : null}
      </Breadcrumb>
      <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
        <span className={css({ color: "faint", display: "inline-flex" })}>
          <IconTask size={18} />
        </span>
        <h1 className={cx(truncate, css({ fontSize: "18px", fontWeight: "600", m: "0" }))}>
          {task.file}
        </h1>
        {/* Only a state that needs attention gets a pill; healthy is the quiet default. */}
        {task.stalled_run_id != null ? (
          <Link
            to="/tasks/$taskId/runs/$runId"
            params={{ taskId: String(task.id), runId: String(task.stalled_run_id) }}
            className={css({ textDecoration: "none" })}
          >
            <Pill tone="warn" title={`Run #${task.stalled_run_id} has no end and will not finish`}>
              Stalled
            </Pill>
          </Link>
        ) : null}
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
        <LatestRun task={task} />
      </div>
      <Behaviour code={code} />
    </header>
  );
}

/**
 * The latest run, and why when it was skipped: where "why did it skip?" starts.
 * A skip is a run like any other; this puts it in sight rather than in Logs.
 */
function LatestRun({ task }: { task: TaskPageData["task"] }) {
  if (task.last_run_id == null || !task.last_status || task.last_status === "success") return null;
  const skip = task.last_status === "skipped" ? readSkip(task.last_skip_reason).short : null;
  return (
    <Link
      to="/tasks/$taskId/runs/$runId"
      params={{ taskId: String(task.id), runId: String(task.last_run_id) }}
      className={css({ color: "muted", textDecoration: "none", _hover: { color: "accent" } })}
      title="Open the latest run"
    >
      latest #{task.last_run_id}{" "}
      {runStateLabel(task.last_status, task.stalled_run_id === task.last_run_id).toLowerCase()}
      {skip ? `: ${skip}` : ""}
    </Link>
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
