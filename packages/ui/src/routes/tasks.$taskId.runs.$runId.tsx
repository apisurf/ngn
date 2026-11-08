// A run, under its task's header, read like a job's result page: the verdict
// and what it cost up top, in one line, then everything the task did on one
// clock — its log lines and its timing spans. The task shrinks to a line above
// the run: the way back to it, and Run now. The code that ran is the task's, so the run links
// to that version rather than showing it again.
//
// `[` and `]` step to the previous and next run of the same task and keep the
// same sub-tab open, so a task's history can be walked without a list.

import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconSkip,
} from "~/components/icons";
import { JsonView } from "~/components/json-view";
import { KvTable } from "~/components/kv-table";
import { LogList } from "~/components/log-list";
import { TaskHeader } from "~/components/task-header";
import {
  Callout,
  Card,
  Dot,
  Empty,
  IconButton,
  LevelBadge,
  mono,
  pagePad,
  scrollPane,
  SectionTitle,
  seriesBg,
  seriesText,
  TabList,
  table,
  Segmented,
  Toggle,
  TONE_BAR,
  truncate,
  VerdictBadge,
} from "~/components/primitives";
import {
  formatAgo,
  formatClockMs,
  formatDateTime,
  formatMs,
  formatOffset,
  plural,
} from "~/lib/format";
import { parseStructured } from "~/lib/json";
import {
  describeDecision,
  failureTitle,
  hooksOf,
  isLifecycle,
  isOpen,
  LEVEL_TONE,
  logLevel,
  readSkip,
  runLabel,
  runMark,
  runStateLabel,
  runTone,
  SKIP_TITLES,
} from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { hasContent, pickRunTab, RUN_TABS, type RunContent, type RunTab } from "~/lib/run-tabs";
import { tabKey, useTab } from "~/lib/tabs";
import type { LogRow, RunPage as RunPageData, TimingRow } from "~/server/api";
import { getRun } from "~/server/api";

const layout = getRouteApi("/tasks/$taskId");

const TABS: ReadonlySet<string> = new Set(RUN_TABS);
const asTab = (value: unknown): RunTab | undefined =>
  TABS.has(value as string) ? (value as RunTab) : undefined;

export const Route = createFileRoute("/tasks/$taskId/runs/$runId")({
  // `tab` is one picked by name. `prefer` is the tab the previous run was on,
  // carried by `[` and `]`, and only kept when this run has something there.
  // With neither, the run opens on its own most useful tab.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: RunTab; prefer?: RunTab; log?: number } => ({
    tab: asTab(search.tab),
    prefer: asTab(search.prefer),
    log: typeof search.log === "number" && Number.isInteger(search.log) ? search.log : undefined,
  }),
  loader: async ({ params, location }) => {
    const page = await getRun({ data: { runId: params.runId } });
    if (!page) throw notFound();
    // A run reached under the wrong task is shown under its own.
    if (String(page.run.task_id) !== params.taskId) {
      throw redirect({
        to: "/tasks/$taskId/runs/$runId",
        params: { taskId: String(page.run.task_id), runId: params.runId },
        search: location.search,
        replace: true,
      });
    }
    return page;
  },
  component: RunPage,
});

function RunPage() {
  const page = Route.useLoaderData();
  const { run, logs, timings, neighbours } = page;
  const search = Route.useSearch();
  const { log } = search;
  const navigate = useNavigate({ from: Route.fullPath });
  useTab({
    key: tabKey.run(run.id),
    title: `${run.editor ? "Editor run" : run.file} #${run.id}`,
    icon: "run",
    failed: run.status === "failure",
  });

  const taskLines = logs.filter((l) => !isLifecycle(l.value));
  const problems = taskLines.filter((l) => logLevel(l.status) !== "info").length;
  const start = run.started_at ?? run.created_at;
  const content: RunContent = {
    failed: run.status === "failure",
    taskLines: taskLines.length,
    timings: timings.length,
    hasResult: page.result != null,
  };
  const tab = pickRunTab(content, search.tab, search.prefer);

  // Walk the task's runs without leaving the pane being read.
  const go = React.useCallback(
    (id: number | null) => {
      if (id == null) return;
      void navigate({
        to: "/tasks/$taskId/runs/$runId",
        params: (p) => ({ ...p, runId: String(id) }),
        search: { prefer: tab },
      });
    },
    [navigate, tab],
  );
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "[") go(neighbours.prev);
      if (event.key === "]") go(neighbours.next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, neighbours.prev, neighbours.next]);

  return (
    <>
      <TaskHeader page={layout.useLoaderData()} linked>
        <RunHeader page={page} go={go} />
        <TabList
          items={[
            {
              id: "timeline",
              label: "Timeline",
              count: taskLines.length + timings.length,
              empty: !hasContent("timeline", content),
            },
            {
              id: "logs",
              label: "Logs",
              count: taskLines.length,
              tone: run.error_count ? "bad" : problems ? "warn" : undefined,
              empty: !hasContent("logs", content),
            },
            {
              id: "timings",
              label: "Timings",
              count: timings.length,
              empty: !hasContent("timings", content),
            },
            { id: "result", label: "Result", empty: !hasContent("result", content) },
            { id: "details", label: "Details" },
          ]}
          dense
          value={tab}
          onSelect={(next) => void navigate({ search: { tab: next } })}
        />
      </TaskHeader>

      {tab === "timeline" ? <TimelineTab page={page} /> : null}
      {tab === "logs" ? (
        <LogList
          key={run.id}
          logs={logs}
          start={start}
          highlight={log}
          lifecycleDefault={false}
          empty="This run wrote no log lines"
        />
      ) : null}
      {tab === "timings" ? <TimingsTab timings={timings} start={start} /> : null}
      {tab === "result" ? <ResultTab result={page.result} /> : null}
      {tab === "details" ? <DetailsTab page={page} /> : null}
    </>
  );
}

function RunHeader({ page, go }: { page: RunPageData; go: (id: number | null) => void }) {
  return (
    <div
      className={css({
        px: "5",
        pt: "2",
        pb: "2",
        display: "flex",
        flexDir: "column",
        gap: "2",
      })}
    >
      <div className={css({ display: "flex", flexDir: "column", gap: "0.5" })}>
        <RunTitle page={page} go={go} />
        <RunFacts page={page} />
      </div>
      {page.attempts.length > 1 ? <Attempts page={page} /> : null}
      <RunCallout page={page} />
    </div>
  );
}

const subtleLink = css({
  color: "muted",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  _hover: { color: "accent" },
});

function RunTitle({ page, go }: { page: RunPageData; go: (id: number | null) => void }) {
  const { run, neighbours } = page;
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "2.5" })}>
      <h1 className={css({ fontSize: "18px", fontWeight: "600", m: "0", whiteSpace: "nowrap" })}>
        Run #{run.id}
      </h1>
      <VerdictBadge tone={runTone(run.status, run.stalled)}>
        {runStateLabel(run.status, run.stalled)}
      </VerdictBadge>
      <div className={css({ display: "flex", gap: "1", flexShrink: 0, ml: "auto" })}>
        <IconButton
          label="Older run of this task ([)"
          disabled={neighbours.prev == null}
          onClick={() => go(neighbours.prev)}
        >
          <IconChevronLeft />
        </IconButton>
        <IconButton
          label="Newer run of this task (])"
          disabled={neighbours.next == null}
          onClick={() => go(neighbours.next)}
        >
          <IconChevronRight />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * What the run cost and recorded, in one line: when, how long, its log lines
 * (with their warnings and errors), its timed spans, the version that ran.
 * What it did not record is said in the same line rather than as zeros.
 */
/** What ngn decided after the run, when it was its tick's final run: `then next run 15:05: …`. */
function decisionPart(decision: RunPageData["decision"]): { key: string; node: React.ReactNode }[] {
  if (!decision) return [];
  const { next_at, reason, source } = decision;
  return [
    {
      key: "then",
      node: (
        <span title="What ngn decided after this run: when the task runs next, and why">
          then {describeDecision(next_at, reason, source)}
        </span>
      ),
    },
  ];
}

function RunFacts({ page }: { page: RunPageData }) {
  const { run, task, timings } = page;
  const now = useNow(Date.now(), 1000);
  const taskLines = page.logs.filter((l) => !isLifecycle(l.value));
  const warns = taskLines.filter((l) => logLevel(l.status) === "warn").length;
  const behind = run.version != null && run.version < task.version;
  const running = isOpen(run.status) && run.started_at != null ? now - run.started_at : null;
  // A skipped run never started: every figure would be a dash.
  const skipped = run.status === "skipped";

  const parts: { key: string; node: React.ReactNode }[] = [
    {
      key: "at",
      node: <span title={`Started ${formatClockMs(run.at)}`}>{formatDateTime(now, run.at)}</span>,
    },
  ];
  if (!skipped) {
    parts.push({
      key: "took",
      node:
        run.duration_ms != null ? (
          <span title={run.ended_at != null ? `Ended ${formatClockMs(run.ended_at)}` : undefined}>
            took <span className={mono}>{formatMs(run.duration_ms)}</span>
          </span>
        ) : running != null ? (
          <span className={run.stalled ? css({ color: "warn" }) : css({ color: "info" })}>
            running for <span className={mono}>{formatMs(running)}</span>
          </span>
        ) : (
          "never started"
        ),
    });
    parts.push({
      key: "logs",
      node: taskLines.length ? (
        <span>
          {plural(taskLines.length, "log line")}
          {run.error_count ? (
            <span className={css({ color: "bad", fontWeight: "500" })}>
              {" "}
              · {plural(run.error_count, "error")}
            </span>
          ) : null}
          {warns ? (
            <span className={css({ color: "warn", fontWeight: "500" })}>
              {" "}
              · {plural(warns, "warning")}
            </span>
          ) : null}
        </span>
      ) : (
        <span className={css({ color: "faint" })}>no log lines</span>
      ),
    });
    parts.push({
      key: "timings",
      node: timings.length ? (
        <span title={`${formatMs(timings.reduce((sum, t) => sum + t.value, 0))} in total`}>
          {plural(timings.length, "timed span")}
        </span>
      ) : (
        <span className={css({ color: "faint" })}>no ctx.timing calls</span>
      ),
    });
  }
  parts.push(...decisionPart(page.decision));
  if (run.version != null) {
    parts.push({
      key: "version",
      node: (
        <span>
          <Link
            to="/tasks/$taskId"
            params={{ taskId: String(task.id) }}
            search={{ tab: "versions", v: run.version_id }}
            className={cx(subtleLink, mono)}
            title="Open the code this run executed"
          >
            v{run.version}
          </Link>
          {behind ? ` (the task is on v${task.version} now)` : null}
        </span>
      ),
    });
  }

  return (
    <div
      className={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: "2",
        color: "muted",
        fontSize: "12px",
      })}
    >
      {parts.map((part, i) => (
        <React.Fragment key={part.key}>
          {i > 0 ? <span className={css({ color: "faint" })}>·</span> : null}
          {part.node}
        </React.Fragment>
      ))}
    </div>
  );
}

/** The tries of this run's tick, in order, each a link; this one marked. */
function Attempts({ page }: { page: RunPageData }) {
  const { run, attempts } = page;
  const { tab } = Route.useSearch();
  return (
    <nav
      aria-label="Attempts in this tick"
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "1",
        flexWrap: "wrap",
        fontSize: "12px",
        color: "muted",
      })}
    >
      <span className={css({ mr: "1" })}>Tries this tick</span>
      {attempts.map((attempt, i) => (
        <React.Fragment key={attempt.id}>
          {i > 0 ? <IconChevronRight size={12} /> : null}
          <Link
            to="/tasks/$taskId/runs/$runId"
            params={{ taskId: String(run.task_id), runId: String(attempt.id) }}
            search={{ tab }}
            aria-current={attempt.id === run.id ? "page" : undefined}
            title={`Try ${i + 1} · ${runLabel(attempt.status)} · ${formatMs(attempt.duration_ms)}`}
            className={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "1.5",
              h: "22px",
              px: "2",
              rounded: "sm",
              color: "muted",
              textDecoration: "none",
              _hover: { bg: "hover", color: "fg" },
              "&[aria-current=page]": { bg: "selected", color: "fg" },
            })}
          >
            <Dot tone={runMark(attempt.status)} />
            <span className={mono}>#{attempt.id}</span>
          </Link>
        </React.Fragment>
      ))}
    </nav>
  );
}

/** Why a run is not simply a success, when it is not. */
function RunCallout({ page }: { page: RunPageData }) {
  if (page.run.status === "failure") return <FailureCallout page={page} />;
  if (page.run.status === "skipped") {
    return <SkipCallout reason={page.run.skip_reason} blockedBy={page.run.blocked_by} />;
  }
  if (isOpen(page.run.status)) return <OpenCallout page={page} />;
  return null;
}

function FailureCallout({ page }: { page: RunPageData }) {
  const { run, code, failure, attempts } = page;
  const hasOnError = hooksOf(code?.compiled_code).includes("onError");
  const retried = attempts.some((a) => a.id > run.id);
  const recovered = attempts[attempts.length - 1]?.status === "success";
  const title = failureTitle(run, attempts);
  return (
    <Callout
      tone={retried && recovered ? "warn" : "bad"}
      icon={<IconAlert size={15} />}
      title={title}
    >
      {failure ? (
        <span className={mono}>{failure}</span>
      ) : (
        <span>
          ngn records that a run failed, not what it threw.
          {hasOnError
            ? " This task's onError hook logged nothing for it."
            : " Log the error from an onError hook and it shows up here."}
        </span>
      )}
    </Callout>
  );
}

function SkipCallout({ reason, blockedBy }: { reason: string | null; blockedBy: number | null }) {
  const skip = readSkip(reason);
  return (
    <Callout tone="neutral" icon={<IconSkip size={15} />} title={SKIP_TITLES[skip.cause]}>
      {skip.cause === "shouldSkip" ? (
        <>
          The task's <span className={mono}>shouldSkip</span> returned true, so neither the task nor
          any other hook ran.
        </>
      ) : skip.cause === "overlap" ? (
        <>
          {blockedBy != null ? (
            <>
              <Link to="/runs/$runId" params={{ runId: String(blockedBy) }}>
                Run #{blockedBy}
              </Link>{" "}
              was still going when this tick fired.
            </>
          ) : (
            "The previous run was still going when this tick fired."
          )}{" "}
          Export <span className={mono}>overlap = "allow"</span> to start one beside it instead.
        </>
      ) : skip.cause === "breaker" ? (
        <>
          The task's last ticks failed in a row, so its <span className={mono}>retry.breaker</span>{" "}
          is holding ticks back. The next one let through closes it again if it succeeds.
        </>
      ) : skip.cause === "lock" ? (
        <>
          Another run held <span className={mono}>{skip.lock}</span>, one of this task's{" "}
          <span className={mono}>exclusive</span> locks. The next tick tries again.
        </>
      ) : (
        <span className={mono}>{reason}</span>
      )}
    </Callout>
  );
}

function OpenCallout({ page }: { page: RunPageData }) {
  const { run, locks, stall } = page;
  const now = useNow(Date.now(), 5_000);
  if (stall && !stall.lease_expired) {
    return (
      <Callout tone="warn" icon={<IconClock size={15} />} title="Stalled — no end recorded">
        It started {formatAgo(now, stall.started_at)} and should have finished within{" "}
        {formatMs(stall.window_ms)}, the longer of its budget and its schedule. The process running
        it most likely stopped before it could record an end; ngn will not record one now.
        {stall.skipped_since ? (
          <>
            {" "}
            It has held back {plural(stall.skipped_since, "tick")} since, each skipped as still
            running. Restarting <span className={mono}>ngn run</span> lets the next tick through.
          </>
        ) : null}
      </Callout>
    );
  }
  // A lease is renewed while its run is alive, so one that ran out says the process stopped.
  const stale = locks.filter((lock) => lock.expires_at <= now);
  if (stale.length) {
    return (
      <Callout tone="warn" icon={<IconClock size={15} />} title="Stalled — its lock was let go">
        Its lock <span className={mono}>{stale.map((l) => l.name).join(", ")}</span> stopped being
        renewed {formatAgo(now, Math.min(...stale.map((l) => l.expires_at)))}, which happens when
        the process running it exits. ngn will not record an end for it.
      </Callout>
    );
  }
  return (
    <Callout tone="info" icon={<IconClock size={15} />} title="No end recorded yet">
      The run is {run.status}
      {locks.length ? (
        <>
          {" "}
          and holds <span className={mono}>{locks.map((l) => l.name).join(", ")}</span>
        </>
      ) : null}
      , or the process running it stopped before it could record an end. Turn on <b>Follow</b> to
      follow it.
    </Callout>
  );
}

// -----------------------------------------------------------------------------
// Timeline: log lines and timing spans on one clock
// -----------------------------------------------------------------------------

type Entry =
  | { type: "log"; at: number; row: LogRow }
  | { type: "timing"; at: number; row: TimingRow };

/** What the timeline lists: everything, or only one kind of entry. */
type TimelineShow = "all" | "logs" | "timings";

const isProblem = (row: LogRow) => logLevel(row.status) !== "info";

function TimelineTab({ page }: { page: RunPageData }) {
  const navigate = useNavigate();
  const { run, logs, timings } = page;
  const [lifecycle, setLifecycle] = React.useState(false);
  const [show, setShow] = React.useState<TimelineShow>("all");
  // Warnings and errors only: what went wrong in this run, in one click.
  const [problems, setProblems] = React.useState(false);

  const start = run.started_at ?? run.created_at;
  const end = Math.max(
    run.ended_at ?? 0,
    ...logs.map((l) => l.created_at),
    ...timings.map((t) => t.created_at),
    start + 1,
  );
  const span = end - start;

  const lines = React.useMemo(
    () => logs.filter((row) => lifecycle || !isLifecycle(row.value)),
    [logs, lifecycle],
  );
  const problemCount = lines.filter(isProblem).length;
  // Spans are placed where they began; a line where it was written.
  const entries: Entry[] = React.useMemo(
    () =>
      [
        ...(show === "timings"
          ? []
          : lines
              .filter((row) => !problems || isProblem(row))
              .map((row): Entry => ({ type: "log", at: row.created_at, row }))),
        // A timing is never a problem: with Problems only it is left out.
        ...(show === "logs" || problems
          ? []
          : timings.map((row): Entry => ({ type: "timing", at: row.created_at - row.value, row }))),
      ].toSorted((a, b) => a.at - b.at || a.row.id - b.row.id),
    [lines, timings, show, problems],
  );

  if (logs.length === 0 && timings.length === 0) {
    return <Empty title="This run recorded nothing" />;
  }
  const onlyLifecycle = lines.length === 0 && timings.length === 0;

  return (
    <div className={css({ display: "flex", flexDir: "column", flex: "1", minH: "0" })}>
      <div
        className={css({
          display: "flex",
          gap: "3",
          px: "5",
          py: "2",
          alignItems: "center",
          flexShrink: 0,
        })}
      >
        <Segmented
          items={[
            { id: "all", label: <Counted label="All" count={lines.length + timings.length} /> },
            { id: "logs", label: <Counted label="Logs" count={lines.length} /> },
            { id: "timings", label: <Counted label="Timings" count={timings.length} /> },
          ]}
          value={show}
          onSelect={setShow}
        />
        <Toggle
          checked={problems}
          onChange={setProblems}
          label={problemCount ? `Problems only · ${problemCount}` : "Problems only"}
        />
        <Toggle checked={lifecycle} onChange={setLifecycle} label="Lifecycle" />
        <span className={css({ ml: "auto", color: "faint", fontSize: "12px" })}>
          {formatMs(span)} end to end
        </span>
      </div>
      {onlyLifecycle ? (
        <Empty title="Only ngn's lifecycle lines">
          The task itself logged and timed nothing in this run. Turn on <b>Lifecycle</b> to see what
          ngn recorded around it.
        </Empty>
      ) : entries.length === 0 ? (
        <Empty title={problems ? "No warnings or errors" : "Nothing of this kind"}>
          {problems
            ? "The run logged no warning or error lines."
            : "This run recorded none. Pick All to see everything it did."}
        </Empty>
      ) : (
        <div className={scrollPane}>
          <table className={table}>
            <thead>
              <tr>
                <th className="num" style={{ width: 90 }}>
                  At
                </th>
                <th>Event</th>
                <th className="num">Took</th>
                <th style={{ width: "32%" }}>Timeline</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) =>
                entry.type === "log" ? (
                  <LogEntry
                    key={`l${entry.row.id}`}
                    row={entry.row}
                    start={start}
                    span={span}
                    onOpen={() =>
                      void navigate({
                        to: "/tasks/$taskId/runs/$runId",
                        params: { taskId: String(run.task_id), runId: String(run.id) },
                        search: { tab: "logs", log: entry.row.id },
                      })
                    }
                  />
                ) : (
                  <TimingEntry key={`t${entry.row.id}`} row={entry.row} start={start} span={span} />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const infoTick = css({ bg: "faint" });

function Counted({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label}
      <span className={css({ color: "faint", fontVariantNumeric: "tabular-nums" })}>{count}</span>
    </>
  );
}

function LogEntry({
  row,
  start,
  span,
  onOpen,
}: {
  row: LogRow;
  start: number;
  span: number;
  onOpen: () => void;
}) {
  const lifecycle = isLifecycle(row.value);
  const tone = LEVEL_TONE[logLevel(row.status)];
  return (
    <tr data-link onClick={onOpen}>
      <td className={cx("num", mono, css({ color: "faint" }))}>
        {formatOffset(row.created_at - start)}
      </td>
      <td className={css({ maxW: "0", w: "full" })}>
        <div className={css({ display: "flex", alignItems: "center", gap: "2", minW: "0" })}>
          <LevelBadge status={row.status} />
          <span
            className={cx(
              truncate,
              mono,
              lifecycle ? css({ color: "faint", fontStyle: "italic" }) : undefined,
            )}
            title={row.value}
          >
            {row.value}
          </span>
        </div>
      </td>
      <td />
      <td>
        <div className={css({ position: "relative", h: "8px" })}>
          <div
            className={cx(
              css({ position: "absolute", top: "-1px", w: "2px", h: "10px", rounded: "full" }),
              // An INFO line is the normal case: a grey tick, not a blue one; ngn's
              // own lifecycle lines fainter still.
              lifecycle ? TONE_BAR.neutral : tone === "info" ? infoTick : TONE_BAR[tone],
            )}
            style={{ left: `${((row.created_at - start) / span) * 100}%` }}
          />
        </div>
      </td>
    </tr>
  );
}

function TimingEntry({ row, start, span }: { row: TimingRow; start: number; span: number }) {
  const began = row.created_at - row.value;
  return (
    <tr>
      <td className={cx("num", mono, css({ color: "faint" }))}>{formatOffset(began - start)}</td>
      <td className={css({ maxW: "0", w: "full" })}>
        <div className={css({ display: "flex", alignItems: "center", gap: "2", minW: "0" })}>
          <span
            className={cx(
              css({
                display: "inline-block",
                w: "42px",
                flexShrink: 0,
                fontFamily: "mono",
                fontSize: "10.5px",
                fontWeight: "700",
              }),
              seriesText(row.label),
            )}
          >
            TIME
          </span>
          <span className={cx(truncate, mono, css({ fontWeight: "600" }))}>{row.label}</span>
        </div>
      </td>
      <td className={cx("num", mono)}>{formatMs(row.value)}</td>
      <td>
        <div
          className={css({ position: "relative", h: "8px" })}
          title={`${row.label} · ${formatOffset(began - start)} · ${formatMs(row.value)}`}
        >
          <div
            className={cx(
              css({ position: "absolute", top: "0", bottom: "0", rounded: "full", minW: "2px" }),
              seriesBg(row.label),
            )}
            style={{
              left: `${(Math.max(0, began - start) / span) * 100}%`,
              width: `${(row.value / span) * 100}%`,
            }}
          />
        </div>
      </td>
    </tr>
  );
}

// -----------------------------------------------------------------------------
// Timings, folded by label
// -----------------------------------------------------------------------------

function TimingsTab({ timings, start }: { timings: TimingRow[]; start: number }) {
  if (timings.length === 0) {
    return (
      <Empty title="No timings in this run" icon={<IconClock size={22} />}>
        A task times a stretch of work with <code>const end = ctx.timing.start("fetch")</code> and
        then <code>await end()</code>.
      </Empty>
    );
  }

  const byLabel = new Map<string, TimingRow[]>();
  for (const t of timings) byLabel.set(t.label, [...(byLabel.get(t.label) ?? []), t]);
  const labels = [...byLabel.entries()].map(([label, rows]) => ({
    label,
    count: rows.length,
    total: rows.reduce((sum, r) => sum + r.value, 0),
    max: Math.max(...rows.map((r) => r.value)),
  }));
  const longest = Math.max(...labels.map((l) => l.total), 1);

  return (
    <div className={scrollPane}>
      <div className={pagePad}>
        <section>
          <SectionTitle>By label</SectionTitle>
          <Card>
            <table className={table}>
              <thead>
                <tr>
                  <th>Label</th>
                  <th className="num">Spans</th>
                  <th className="num">Total</th>
                  <th className="num">Longest</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((l) => (
                  <tr key={l.label}>
                    <td className={css({ w: "full" })}>
                      <div className={cx(mono, css({ fontWeight: "600" }))}>{l.label}</div>
                      <div
                        className={cx(
                          css({ h: "4px", mt: "1", rounded: "full" }),
                          seriesBg(l.label),
                        )}
                        style={{ width: `${(l.total / longest) * 100}%` }}
                      />
                    </td>
                    <td className="num">{l.count}</td>
                    <td className={cx("num", mono)}>{formatMs(l.total)}</td>
                    <td className={cx("num", mono)}>{formatMs(l.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
        <section>
          <SectionTitle>Every span</SectionTitle>
          <Card>
            <table className={table}>
              <thead>
                <tr>
                  <th>Label</th>
                  <th className="num">Began</th>
                  <th className="num">Took</th>
                </tr>
              </thead>
              <tbody>
                {timings.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span
                        className={css({ display: "inline-flex", alignItems: "center", gap: "2" })}
                      >
                        <span
                          className={cx(
                            css({ w: "8px", h: "8px", rounded: "xs" }),
                            seriesBg(t.label),
                          )}
                        />
                        <span className={mono}>{t.label}</span>
                      </span>
                    </td>
                    <td className={cx("num", mono, css({ color: "muted" }))}>
                      {formatOffset(t.created_at - t.value - start)}
                    </td>
                    <td className={cx("num", mono)}>{formatMs(t.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Result
// -----------------------------------------------------------------------------

/** What the task returned: a tree for an object or array, the JSON text otherwise. */
function ResultTab({ result }: { result: string | null }) {
  if (result == null) return <Empty title="This run returned nothing" />;
  const structured = parseStructured(result);
  return (
    <div className={cx(scrollPane, css({ bg: "well" }))}>
      {structured !== undefined ? (
        <JsonView value={structured} />
      ) : (
        <pre className={cx(mono, css({ p: "3", whiteSpace: "pre-wrap" }))}>{result}</pre>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Details
// -----------------------------------------------------------------------------

function DetailsTab({ page }: { page: RunPageData }) {
  const { run, task, code } = page;
  const now = useNow(Date.now(), 60_000);
  const at = (ms: number | null) => (ms == null ? "—" : `${formatDateTime(now, ms)} · ${ms}`);
  const rows = [
    { name: "id", value: String(run.id) },
    { name: "status", value: run.status },
    { name: "task", value: `${run.path} (file_task_id ${task.id})` },
    {
      name: "version",
      value: run.version != null ? `v${run.version} (file_task_version_id ${run.version_id})` : "—",
    },
    { name: "md5", value: code?.md5_hash ?? "—" },
    { name: "created", value: at(run.created_at) },
    { name: "started", value: at(run.started_at) },
    { name: "ended", value: at(run.ended_at) },
    { name: "duration", value: formatMs(run.duration_ms) },
    ...(page.attempts.length > 1
      ? [
          {
            name: "attempt",
            value: `${run.attempt} of ${page.attempts.length}${run.retry_of != null ? ` (retry_of ${run.retry_of})` : ""}`,
          },
        ]
      : []),
    ...(run.status === "skipped"
      ? [{ name: "skip_reason", value: run.skip_reason ?? "— (shouldSkip returned true)" }]
      : []),
    ...page.locks.map((lock) => ({
      name: `lock ${lock.name}`,
      value: `held by ${lock.holder} since ${formatDateTime(now, lock.acquired_at)}, lease to ${formatDateTime(now, lock.expires_at)}`,
    })),
  ];
  return (
    <div className={scrollPane}>
      <div className={pagePad}>
        <section>
          <SectionTitle>Run</SectionTitle>
          <Card>
            <KvTable rows={rows} empty="" filterable={false} nameLabel="Field" />
          </Card>
        </section>
      </div>
    </div>
  );
}
