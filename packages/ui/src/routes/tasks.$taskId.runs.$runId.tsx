// A run, under its task's header, read like a job's result page: the verdict
// and what it cost up top, then everything the task did on one clock — its log
// lines and its timing spans. The code that ran is the task's, so the run links
// to that version rather than showing it again.
//
// `[` and `]` step to the previous and next run of the same task and keep the
// same sub-tab open, so a task's history can be walked without a list.

import { createFileRoute, Link, notFound, redirect, useNavigate } from "@tanstack/react-router";
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
import {
  Callout,
  Card,
  Dot,
  Empty,
  IconButton,
  LevelBadge,
  mono,
  pagePad,
  RunBadge,
  scrollPane,
  SectionTitle,
  seriesBg,
  seriesText,
  Stat,
  StatGrid,
  TabList,
  table,
  Toggle,
  TONE_BAR,
  truncate,
} from "~/components/primitives";
import {
  formatAgo,
  formatClockMs,
  formatCount,
  formatDateTime,
  formatMs,
  formatOffset,
  plural,
} from "~/lib/format";
import { parseStructured } from "~/lib/json";
import type { SkipCause } from "~/lib/ngn";
import {
  hooksOf,
  isLifecycle,
  isOpen,
  LEVEL_TONE,
  logLevel,
  readSkip,
  runLabel,
  runTone,
} from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import type { LogRow, RunPage as RunPageData, TimingRow } from "~/server/api";
import { getRun } from "~/server/api";

type RunTab = "timeline" | "logs" | "timings" | "result" | "details";
const TABS: ReadonlySet<string> = new Set(["logs", "timings", "result", "details"]);

export const Route = createFileRoute("/tasks/$taskId/runs/$runId")({
  validateSearch: (search: Record<string, unknown>): { tab?: RunTab; log?: number } => ({
    // "timeline" is the default, so it never appears in the URL.
    tab: TABS.has(search.tab as string) ? (search.tab as RunTab) : undefined,
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
  const { tab = "timeline", log } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  useTab({
    key: tabKey.run(run.id),
    title: `${run.live ? "Live editor" : run.file} #${run.id}`,
    icon: "run",
    failed: run.status === "failure",
  });

  // Walk the task's runs without leaving the pane being read.
  const go = React.useCallback(
    (id: number | null) => {
      if (id == null) return;
      void navigate({
        to: "/tasks/$taskId/runs/$runId",
        params: (p) => ({ ...p, runId: String(id) }),
        search: (s) => ({ tab: s.tab }),
      });
    },
    [navigate],
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

  const taskLines = logs.filter((l) => !isLifecycle(l.value));
  const problems = taskLines.filter((l) => logLevel(l.status) !== "info").length;
  const start = run.started_at ?? run.created_at;

  return (
    <>
      <RunHeader page={page} go={go} />

      <TabList
        items={[
          { id: "timeline", label: "Timeline", count: taskLines.length + timings.length },
          {
            id: "logs",
            label: "Logs",
            count: taskLines.length,
            tone: run.error_count ? "bad" : problems ? "warn" : undefined,
          },
          { id: "timings", label: "Timings", count: timings.length },
          ...(page.result != null ? [{ id: "result" as const, label: "Result" }] : []),
          { id: "details", label: "Details" },
        ]}
        dense
        value={tab}
        onSelect={(next) =>
          void navigate({ search: { tab: next === "timeline" ? undefined : next } })
        }
      />

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
    <header
      className={css({
        px: "5",
        pt: "3",
        pb: "3",
        display: "flex",
        flexDir: "column",
        gap: "3",
        flexShrink: 0,
        borderTop: "1px solid",
        borderColor: "line",
      })}
    >
      <RunTitle page={page} go={go} />
      {page.attempts.length > 1 ? <Attempts page={page} /> : null}
      <RunCallout page={page} />
      {/* A skipped run never started: every figure would be a dash. */}
      {page.run.status === "skipped" ? null : <RunStats page={page} />}
    </header>
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
  const { run, task, neighbours } = page;
  const now = useNow(Date.now(), 60_000);
  const behind = run.version != null && run.version < task.version;
  const taskId = String(task.id);

  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "3" })}>
      <div
        className={css({
          minW: "0",
          flex: "1",
          display: "flex",
          alignItems: "center",
          gap: "2",
          flexWrap: "wrap",
          fontSize: "13px",
        })}
      >
        <Link
          to="/tasks/$taskId"
          params={{ taskId }}
          className={subtleLink}
          title="Back to the task's runs"
        >
          <IconChevronLeft size={14} />
          Runs
        </Link>
        <span className={css({ color: "faint" })}>/</span>
        <h2 className={css({ fontFamily: "mono", fontSize: "14px", fontWeight: "600", m: "0" })}>
          #{run.id}
        </h2>
        <RunBadge status={run.status} pill />
        <span className={css({ color: "muted", fontSize: "12px" })}>
          {formatDateTime(now, run.at)}
        </span>
        {run.version != null ? (
          <>
            <span className={css({ color: "faint" })}>·</span>
            <Link
              to="/tasks/$taskId"
              params={{ taskId }}
              search={{ tab: "versions", v: run.version_id }}
              className={cx(subtleLink, mono, css({ fontSize: "12px" }))}
              title="Open the code this run executed"
            >
              v{run.version}
            </Link>
            {behind ? (
              <span className={css({ color: "muted", fontSize: "12px" })}>
                (the task is on v{task.version} now)
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <div className={css({ display: "flex", gap: "1", flexShrink: 0 })}>
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
            <Dot tone={runTone(attempt.status)} />
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
  if (page.run.status === "skipped") return <SkipCallout reason={page.run.skip_reason} />;
  if (isOpen(page.run.status)) return <OpenCallout page={page} />;
  return null;
}

function FailureCallout({ page }: { page: RunPageData }) {
  const { run, code, failure, attempts } = page;
  const hasOnError = hooksOf(code?.compiled_code).includes("onError");
  const retried = attempts.some((a) => a.id > run.id);
  const recovered = attempts[attempts.length - 1]?.status === "success";
  const title = retried
    ? `Try ${run.attempt} of ${attempts.length} failed — ${recovered ? "a retry succeeded" : "retried"}`
    : attempts.length > 1
      ? `Failed after ${attempts.length} tries`
      : "The task failed";
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

function SkipCallout({ reason }: { reason: string | null }) {
  const skip = readSkip(reason);
  return (
    <Callout tone="neutral" icon={<IconSkip size={15} />} title={SKIP_TITLE[skip.cause]}>
      {skip.cause === "shouldSkip" ? (
        <>
          The task's <span className={mono}>shouldSkip</span> returned true, so neither the task nor
          any other hook ran.
        </>
      ) : skip.cause === "overlap" ? (
        <>
          The previous run was still going when this tick fired. Export{" "}
          <span className={mono}>overlap = "allow"</span> to start one beside it instead.
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
  const { run, locks } = page;
  const now = useNow(Date.now(), 5_000);
  // A lease is renewed while its run is alive, so one that ran out says the process stopped.
  const stale = locks.filter((lock) => lock.expires_at <= now);
  if (stale.length) {
    return (
      <Callout tone="warn" icon={<IconClock size={15} />} title="No end recorded — likely stopped">
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
      , or the process running it stopped before it could record an end. Turn on <b>Live</b> to
      follow it.
    </Callout>
  );
}

const SKIP_TITLE: Record<SkipCause, string> = {
  shouldSkip: "Skipped by shouldSkip",
  overlap: "Skipped — the previous run was still going",
  breaker: "Skipped — circuit open",
  lock: "Skipped — a lock was busy",
  other: "Skipped",
};

function RunStats({ page }: { page: RunPageData }) {
  const { run, timings } = page;
  const now = useNow(Date.now(), 1000);
  const running = isOpen(run.status) && run.started_at != null ? now - run.started_at : null;
  const taskLines = page.logs.filter((l) => !isLifecycle(l.value));
  const warns = taskLines.filter((l) => logLevel(l.status) === "warn").length;
  const timed = timings.reduce((sum, t) => sum + t.value, 0);
  const noisy = run.error_count > 0 || warns > 0;

  return (
    <StatGrid>
      <Stat
        label="Duration"
        value={formatMs(run.duration_ms ?? running)}
        sub={
          run.duration_ms != null ? "start to end" : running != null ? "so far" : "never started"
        }
        tone={running != null ? "info" : undefined}
      />
      <Stat
        label="Logs"
        value={formatCount(taskLines.length)}
        tone={run.error_count ? "bad" : warns ? "warn" : undefined}
        sub={
          noisy
            ? `${plural(warns, "warning")} · ${plural(run.error_count, "error")}`
            : "no warnings or errors"
        }
      />
      <Stat
        label="Timed spans"
        value={formatCount(timings.length)}
        sub={timings.length ? `${formatMs(timed)} in total` : "no ctx.timing calls"}
      />
      <Stat
        label="Started"
        value={run.started_at != null ? formatClockMs(run.started_at).slice(0, 8) : "—"}
        sub={run.ended_at != null ? `ended ${formatClockMs(run.ended_at)}` : "no end recorded"}
      />
    </StatGrid>
  );
}

// -----------------------------------------------------------------------------
// Timeline: log lines and timing spans on one clock
// -----------------------------------------------------------------------------

type Entry =
  | { type: "log"; at: number; row: LogRow }
  | { type: "timing"; at: number; row: TimingRow };

function TimelineTab({ page }: { page: RunPageData }) {
  const navigate = useNavigate();
  const { run, logs, timings } = page;
  const [lifecycle, setLifecycle] = React.useState(false);

  const start = run.started_at ?? run.created_at;
  const end = Math.max(
    run.ended_at ?? 0,
    ...logs.map((l) => l.created_at),
    ...timings.map((t) => t.created_at),
    start + 1,
  );
  const span = end - start;

  // Spans are placed where they began; a line where it was written.
  const entries: Entry[] = React.useMemo(
    () =>
      [
        ...logs
          .filter((row) => lifecycle || !isLifecycle(row.value))
          .map((row): Entry => ({ type: "log", at: row.created_at, row })),
        ...timings.map((row): Entry => ({ type: "timing", at: row.created_at - row.value, row })),
      ].toSorted((a, b) => a.at - b.at || a.row.id - b.row.id),
    [logs, timings, lifecycle],
  );

  if (logs.length === 0 && timings.length === 0) {
    return <Empty title="This run recorded nothing" />;
  }
  const hidden = entries.length === 0;

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
        <Toggle checked={lifecycle} onChange={setLifecycle} label="Lifecycle" />
        <span className={css({ ml: "auto", color: "faint", fontSize: "12px" })}>
          {formatMs(span)} end to end
        </span>
      </div>
      {hidden ? (
        <Empty title="Only ngn's lifecycle lines">
          The task itself logged and timed nothing in this run. Turn on <b>Lifecycle</b> to see what
          ngn recorded around it.
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
              lifecycle ? TONE_BAR.neutral : TONE_BAR[tone],
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
