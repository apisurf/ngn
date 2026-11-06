// A task's header: what the task is and how it is doing. It heads the task's
// own tabs and every run of it, so a run is always read under its task.
//
// It is one raised band, holding whatever the page puts under the task line (a
// run's title and figures, then the page's tabs), so the header reads as a
// single piece and never as one of the details below it.
//
// Under a run it shrinks to one line, the task's name as the way back, and says
// nothing about the task's health: that is about its newest run, which the run
// below may not be.
//
// The schedule, the exports that shape how it runs (retry, budget, overlap,
// exclusive locks) and its hooks are read out of the newest version's compiled
// code: ngn keeps them nowhere else.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
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
import { useNow, usePrefs } from "~/lib/prefs";
import type { TaskItem, TaskPage } from "~/server/api";
import { runTask } from "~/server/api";
import { IconCheck, IconClock, IconCode, IconPlay, IconTask } from "./icons";
import { Button, mono, Pill, truncate, VerdictBadge } from "./primitives";

const root = getRouteApi("__root__");

export function TaskHeader({
  page,
  linked = false,
  children,
}: {
  page: TaskPage;
  /** A page under the task (a run): the task shrinks to a line that links back to it. */
  linked?: boolean;
  /** What the page puts in the band under the task: a run's title, then the tabs. */
  children?: React.ReactNode;
}) {
  return (
    <header
      className={css({
        position: "relative",
        // Above the page's own sticky rows, so its shadow falls on them.
        zIndex: 2,
        flexShrink: 0,
        bg: "masthead",
        borderBottom: "1px solid",
        borderColor: "mastheadLine",
        boxShadow: "masthead",
        // The page's tabs close the band; their own rule would double it.
        "& > [role=tablist]": { borderBottom: "none" },
      })}
    >
      <div
        className={css({
          display: "flex",
          flexDir: "column",
          gap: "0.5",
          px: "5",
          pt: linked ? "2.5" : "4",
          pb: children ? "1" : "3",
          fontSize: "12px",
          color: "muted",
        })}
      >
        {page.task.editor ? (
          <EditorLine />
        ) : linked ? (
          <TaskLine task={page.task} />
        ) : (
          <TaskTitle page={page} />
        )}
      </div>
      {children}
    </header>
  );
}

const row = css({ display: "flex", alignItems: "center", gap: "2", minW: "0" });

const backLink = cx(
  truncate,
  css({
    fontSize: "13px",
    fontWeight: "600",
    color: "fg",
    textDecoration: "none",
    _hover: { color: "accent", textDecoration: "underline" },
  }),
);

/** An editor run is not one of the project's tasks: its way back is the Editor. */
function EditorLine() {
  return (
    <div className={row}>
      <span className={css({ display: "inline-flex", color: "faint" })}>
        <IconCode size={14} />
      </span>
      <Link to="/live" className={backLink} title="Back to the Editor and its recent runs">
        Editor
      </Link>
    </div>
  );
}

/** Above a run: only the way back, and Run now. */
function TaskLine({ task }: { task: TaskItem }) {
  return (
    <div className={row}>
      <span className={css({ display: "inline-flex", color: "faint" })}>
        <IconTask size={14} />
      </span>
      <Link
        to="/tasks/$taskId"
        params={{ taskId: String(task.id) }}
        className={backLink}
        title={`${task.path}: the task's runs`}
      >
        {task.file}
      </Link>
      <span className={actions}>
        <RunNowButton task={task} />
      </span>
    </div>
  );
}

const actions = css({
  ml: "auto",
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
  minW: "0",
});

function TaskTitle({ page }: { page: TaskPage }) {
  const { task, latest } = page;
  const now = useNow(Date.now(), 60_000);
  const code = latest?.compiled_code;
  const cron = cronOf(code);
  const cadence = cron ? describeCron(cron) : null;

  return (
    <>
      <div className={row}>
        <span className={css({ display: "inline-flex", color: "faint" })}>
          <IconTask size={18} />
        </span>
        <h1
          className={cx(
            truncate,
            css({ fontSize: "18px", fontWeight: "600", m: "0", color: "fg" }),
          )}
        >
          {task.file}
        </h1>
        <Health task={task} />
        {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
        <span className={actions}>
          <RunNowButton task={task} />
        </span>
      </div>
      <div className={cx(facts, css({ pl: "26px" }))}>
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
    </>
  );
}

const facts = css({
  display: "flex",
  columnGap: "4",
  rowGap: "1",
  color: "muted",
  flexWrap: "wrap",
  alignItems: "center",
  fontSize: "12px",
  minW: "0",
});

/**
 * How the task is doing, in words: the worst of Stalled, Circuit open and
 * Failing, else Healthy once it has a verdict at all. Its latest run, not its
 * history: one failure last week does not make a task Failing today.
 */
function Health({ task }: { task: TaskItem }) {
  const stalled = task.stalled_run_id;
  if (stalled != null) {
    return (
      <Link
        to="/tasks/$taskId/runs/$runId"
        params={{ taskId: String(task.id), runId: String(stalled) }}
        className={css({ textDecoration: "none" })}
      >
        <VerdictBadge tone="warn" title={`Run #${stalled} has no end and will not finish`}>
          Stalled
        </VerdictBadge>
      </Link>
    );
  }
  if (circuitOpen(task)) {
    return (
      <VerdictBadge tone="bad" title="ngn is skipping ticks after repeated failures">
        Circuit open
      </VerdictBadge>
    );
  }
  if (task.last_outcome === "failure") {
    return (
      <VerdictBadge tone="bad" title="Its latest run that reached a verdict failed">
        Failing
      </VerdictBadge>
    );
  }
  if (task.last_outcome === "success") {
    return (
      <VerdictBadge tone="ok" title="Its latest run that reached a verdict succeeded">
        Healthy
      </VerdictBadge>
    );
  }
  return null;
}

/**
 * The latest run, and why when it was skipped: where "why did it skip?" starts.
 * A skip is a run like any other; this puts it in sight rather than in Logs.
 */
function LatestRun({ task }: { task: TaskItem }) {
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
    <div className={cx(facts, css({ pl: "26px" }))}>
      {items.map((item) => (
        <span key={item.label} title={item.title} className={css({ whiteSpace: "nowrap" })}>
          <span className={css({ color: "faint" })}>{item.label} </span>
          <span className={cx(mono, css({ color: "fg" }))}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Run now
// -----------------------------------------------------------------------------

/** How long "Started" stays on the button before it reads Run now again. */
const STARTED_MS = 2500;

/**
 * Start a run of the task now, in the `ngn run` the editor uses. The run is
 * recorded like any tick's; Follow is turned on so it shows up as it goes.
 */
function RunNowButton({ task }: { task: TaskItem }) {
  const ws = root.useLoaderData();
  const { set, refresh } = usePrefs();
  const [state, setState] = React.useState<
    { kind: "idle" } | { kind: "starting" } | { kind: "started" } | { kind: "error"; error: string }
  >({ kind: "idle" });

  React.useEffect(() => {
    if (state.kind !== "started") return;
    const timer = window.setTimeout(() => setState({ kind: "idle" }), STARTED_MS);
    return () => window.clearTimeout(timer);
  }, [state.kind]);

  const start = async () => {
    setState({ kind: "starting" });
    try {
      const outcome = await runTask({ data: { token: ws.token, taskId: task.id } });
      if (!outcome.ok) return setState({ kind: "error", error: outcome.error });
      setState({ kind: "started" });
      set("follow", true);
      refresh();
    } catch (err) {
      setState({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    }
  };

  const off = ws.live == null;
  return (
    <>
      {state.kind === "error" ? (
        <span
          role="status"
          title={state.error}
          className={cx(truncate, css({ color: "bad", fontSize: "12px", maxW: "360px" }))}
        >
          {state.error}
        </span>
      ) : null}
      <Button
        onClick={() => void start()}
        disabled={off || state.kind === "starting"}
        title={
          off
            ? "No runtime: start `ngn run` in this project to run tasks from here"
            : "Start a run of this task now, in the running ngn run"
        }
      >
        {state.kind === "started" ? <IconCheck size={13} /> : <IconPlay size={12} />}
        {state.kind === "started" ? "Started" : state.kind === "starting" ? "Starting…" : "Run now"}
      </Button>
    </>
  );
}
