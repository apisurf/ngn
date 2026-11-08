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
  describeLimits,
  describeTiming,
  nextReason,
  nextRunWords,
  timingOf,
  timingSource,
  hooksOf,
  readSkip,
  runStateLabel,
} from "~/lib/ngn";
import { useNow, usePrefs } from "~/lib/prefs";
import type { LiveStatus, ScheduleAction, TaskItem, TaskPage } from "~/server/api";
import { getLiveStatus, runTask, steerTask } from "~/server/api";
import {
  IconCheck,
  IconClock,
  IconCode,
  IconPause,
  IconPlay,
  IconSkipForward,
  IconTask,
} from "./icons";
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
  const timing = timingOf(code);
  const cadence = describeTiming(timing);
  const limits = describeLimits(timing);

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
        {task.schedule?.state === "paused" ? (
          <Pill title="A person paused it: no runs until it is resumed">Paused</Pill>
        ) : null}
        {task.status !== "active" ? <Pill>{task.status}</Pill> : null}
        <span className={actions}>
          <ScheduleControls task={task} />
          <RunNowButton task={task} />
        </span>
      </div>
      <div className={cx(facts, css({ pl: "26px" }))}>
        <span className={mono} title="Path relative to the project root">
          {task.path}
        </span>
        {timing ? (
          <span
            className={css({ display: "inline-flex", alignItems: "center", gap: "1" })}
            title={`timing = ${timingSource(timing)}`}
          >
            <IconClock size={12} />
            {typeof timing === "string" && cadence === timing ? (
              <span className={mono}>{timing}</span>
            ) : (
              cadence
            )}
            {limits ? (
              <span title="min–max: how fast and how slow its runs may go">{` · ${limits}`}</span>
            ) : null}
          </span>
        ) : null}
        <NextRun task={task} words={cadence} now={now} />
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

/** `next in 4m`, `paused`, `blocked by run #41`, with why and who chose it on hover. */
function NextRun({ task, words, now }: { task: TaskItem; words: string | null; now: number }) {
  if (!task.schedule) return null;
  const { text, why, tone } = nextRunWords(task.schedule, now);
  // Inline only when it says more than the schedule beside it; the tooltip has it all.
  const reason = nextReason(task.schedule, words);
  const state = task.schedule.state;
  const label =
    state === "paused" || state === "running" || state === "blocked" ? text : `next ${text}`;
  return (
    <span
      title={why ?? undefined}
      className={cx(
        css({ display: "inline-flex", alignItems: "center", gap: "1" }),
        tone === "warn" ? css({ color: "warn" }) : undefined,
      )}
    >
      {label}
      {reason && state !== "paused" ? (
        <span className={cx(truncate, css({ color: "faint", maxW: "420px" }))}>· {reason}</span>
      ) : null}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Pause, Resume and Run next
// -----------------------------------------------------------------------------

/** How long what ngn said about a Pause, Resume or Run next stays up; an error stays. */
const NOTE_MS = 4000;

/** Whether the `ngn run` ngnui forwards to can pause and move tasks; asked once per page. */
function useLiveStatus(): LiveStatus | null {
  const ws = root.useLoaderData();
  const [status, setStatus] = React.useState<LiveStatus | null>(null);
  React.useEffect(() => {
    if (ws.live == null) return setStatus({ state: "off" });
    let current = true;
    getLiveStatus()
      .then((answer) => current && setStatus(answer))
      .catch(() => current && setStatus({ state: "off" }));
    return () => {
      current = false;
    };
  }, [ws.live]);
  return status;
}

/**
 * Pause or Resume, and Run next, through the live runtime: the same changes
 * as `ngn pause`, `resume` and `next`, logged with source `cli`. Without a
 * runtime that can make them, the commands to run instead.
 */
function ScheduleControls({ task }: { task: TaskItem }) {
  const ws = root.useLoaderData();
  const status = useLiveStatus();
  const { set, refresh } = usePrefs();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ error: boolean; text: string } | null>(null);
  React.useEffect(() => {
    if (!note || note.error) return;
    const timer = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);
  const schedule = task.schedule;
  if (!schedule || status == null) return null;

  const paused = schedule.state === "paused";
  if (status.state !== "up" || !status.schedule) {
    const command = `ngn ${paused ? "resume" : "pause"} ${task.path}`;
    return (
      <span
        className={cx(mono, css({ color: "faint", fontSize: "11.5px" }))}
        title={
          status.state === "up"
            ? "This ngn run cannot pause or move tasks; update it, or run this in a terminal"
            : "No runtime to do it from here: run this in a terminal (ngn next <task> now moves its next run)"
        }
      >
        {command}
      </span>
    );
  }

  const act = async (action: ScheduleAction) => {
    setBusy(true);
    setNote(null);
    try {
      const outcome = await steerTask({ data: { token: ws.token, taskId: task.id, action } });
      setNote(
        outcome.ok ? { error: false, text: outcome.message } : { error: true, text: outcome.error },
      );
      set("follow", true);
      refresh();
    } catch (err) {
      setNote({ error: true, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {note ? (
        <span
          role="status"
          title={note.text}
          className={cx(
            truncate,
            css({ fontSize: "12px", maxW: "320px" }),
            note.error ? css({ color: "bad" }) : css({ color: "muted" }),
          )}
        >
          {note.text}
        </span>
      ) : null}
      {paused ? (
        <Button
          onClick={() => void act("resume")}
          disabled={busy}
          title="ngn resume: let it run again"
        >
          <IconPlay size={12} />
          Resume
        </Button>
      ) : (
        <Button
          onClick={() => void act("pause")}
          disabled={busy}
          title="ngn pause: no new runs; a run in progress finishes first"
        >
          <IconPause size={12} />
          Pause
        </Button>
      )}
      <Button
        onClick={() => void act("next")}
        disabled={busy || paused}
        title={
          paused ? "Resume it first" : "ngn next now: its next scheduled run, as soon as possible"
        }
      >
        <IconSkipForward size={12} />
        Run next
      </Button>
    </>
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
