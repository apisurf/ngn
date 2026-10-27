// A task's tabs, under its header:
//
//   Runs       every execution, with a strip of durations so a bad afternoon
//              shows up before anyone reads a number; a row opens that run
//   Timings    each `ctx.timing` label's record: count, p50, p95, the trend
//   Logs       every line it wrote, across runs
//   Store      its `ctx.kv` keys, as they stand now
//   Versions   each distinct build of the file, how its runs went, its code

import { createFileRoute, getRouteApi, notFound, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { DurationStrip, Sparkline } from "~/components/charts";
import { CodeViewer } from "~/components/code";
import { IconClock, IconKey } from "~/components/icons";
import { KvTable } from "~/components/kv-table";
import { LogList } from "~/components/log-list";
import {
  Card,
  Dot,
  Empty,
  LogCount,
  mono,
  pagePad,
  RunOutcome,
  scrollPane,
  SectionTitle,
  Segmented,
  Stat,
  StatGrid,
  TabList,
  table,
  truncate,
} from "~/components/primitives";
import { formatAgo, formatCount, formatDateTime, formatMs, plural } from "~/lib/format";
import { prettyJson } from "~/lib/json";
import { percentile, readSkip, runTone } from "~/lib/ngn";
import { useNow, usePrefs } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import type {
  KvRow,
  LogRow,
  RunRow,
  SkipCount,
  TaskDetails,
  TaskItem,
  TimingStat,
} from "~/server/api";
import { getLogs, getTaskDetails } from "~/server/api";

type TaskTab = "runs" | "timings" | "logs" | "store" | "versions";
const TABS: ReadonlySet<string> = new Set(["timings", "logs", "store", "versions"]);

const layout = getRouteApi("/tasks/$taskId");

export const Route = createFileRoute("/tasks/$taskId/")({
  validateSearch: (search: Record<string, unknown>): { tab?: TaskTab; v?: number } => ({
    // "runs" is the default, so it never appears in the URL.
    tab: TABS.has(search.tab as string) ? (search.tab as TaskTab) : undefined,
    v: typeof search.v === "number" && Number.isInteger(search.v) ? search.v : undefined,
  }),
  loaderDeps: ({ search }) => ({ v: search.v }),
  loader: async ({ params, deps }) => {
    const details = await getTaskDetails({ data: { taskId: params.taskId, versionId: deps.v } });
    if (!details) throw notFound();
    return details;
  },
  component: TaskPage,
});

function TaskPage() {
  const { task } = layout.useLoaderData();
  const details = Route.useLoaderData();
  const { timings, versions, keys } = details;
  const { tab = "runs" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const now = useNow(Date.now());
  useTab({
    key: tabKey.task(task.id),
    title: task.live ? "Live editor task" : task.file,
    icon: "task",
    failed: task.last_outcome === "failure",
  });

  return (
    <>
      <TabList
        items={[
          { id: "runs", label: "Runs", count: task.run_count },
          { id: "timings", label: "Timings", count: timings.length },
          { id: "logs", label: "Logs" },
          { id: "store", label: "Store", count: keys.length },
          { id: "versions", label: "Versions", count: versions.length },
        ]}
        value={tab}
        onSelect={(next) =>
          void navigate({ search: (s) => ({ ...s, tab: next === "runs" ? undefined : next }) })
        }
      />

      {tab === "runs" ? (
        <div className={scrollPane}>
          <div className={pagePad}>
            <RunsTab task={task} runs={details.runs} skips={details.skips} now={now} />
          </div>
        </div>
      ) : null}
      {tab === "timings" ? (
        <div className={scrollPane}>
          <div className={pagePad}>
            <TimingsTab taskId={task.id} timings={timings} />
          </div>
        </div>
      ) : null}
      {tab === "logs" ? <LogsTab taskId={task.id} /> : null}
      {tab === "store" ? (
        <div className={scrollPane}>
          <div className={pagePad}>
            <StoreTab keys={keys} now={now} />
          </div>
        </div>
      ) : null}
      {tab === "versions" ? <VersionsTab details={details} now={now} /> : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Runs
// -----------------------------------------------------------------------------

type Show = "all" | "failure" | "skipped";

function RunsTab({
  task,
  runs,
  skips,
  now,
}: {
  task: TaskItem;
  runs: RunRow[];
  skips: SkipCount[];
  now: number;
}) {
  const navigate = useNavigate();
  const [show, setShow] = React.useState<Show>("all");
  if (runs.length === 0) return <Empty title="This task has not run yet" />;

  const visible = show === "all" ? runs : runs.filter((r) => r.status === show);

  return (
    <>
      <TaskStats task={task} runs={runs} skips={skips} now={now} />

      <section>
        <SectionTitle>Duration per run</SectionTitle>
        <DurationStrip runs={runs} />
      </section>

      {skips.length > 1 ? <SkipBreakdown skips={skips} /> : null}

      <section>
        <SectionTitle
          right={
            // Filters only for what there is to filter to.
            task.failure_count || task.skipped_count ? (
              <Segmented
                items={[
                  { id: "all" as const, label: "All" },
                  ...(task.failure_count
                    ? [{ id: "failure" as const, label: `Failed ${task.failure_count}` }]
                    : []),
                  ...(task.skipped_count
                    ? [{ id: "skipped" as const, label: `Skipped ${task.skipped_count}` }]
                    : []),
                ]}
                value={show}
                onSelect={setShow}
              />
            ) : null
          }
        >
          History
        </SectionTitle>
        <Card>
          <RunsTable
            runs={visible}
            now={now}
            latestVersion={task.version}
            versions={task.version_count}
            onOpen={(id) =>
              void navigate({
                to: "/tasks/$taskId/runs/$runId",
                params: { taskId: String(task.id), runId: String(id) },
              })
            }
          />
        </Card>
        {runs.length < task.run_count ? (
          <p className={css({ color: "faint", fontSize: "12px", mt: "2", mb: "0" })}>
            Showing the latest {formatCount(runs.length)} of {formatCount(task.run_count)} runs.{" "}
            <code>ngn sql</code> reaches the rest.
          </p>
        ) : null}
      </section>
    </>
  );
}

function TaskStats({
  task,
  runs,
  skips,
  now,
}: {
  task: TaskItem;
  runs: RunRow[];
  skips: SkipCount[];
  now: number;
}) {
  const durations = runs
    .map((r) => r.duration_ms)
    .filter((d): d is number => d != null)
    .toSorted((a, b) => a - b);
  const decided = task.success_count + task.failure_count;
  const rate = decided ? Math.round((task.success_count / decided) * 1000) / 10 : null;
  const topSkip = skips[0];

  return (
    <StatGrid>
      <Stat
        label="Runs"
        value={formatCount(task.run_count)}
        sub={runs[0] ? `last ${formatAgo(now, runs[0].at)}` : undefined}
      />
      <Stat
        label="Success rate"
        value={rate == null ? "—" : `${rate}%`}
        tone={rate != null && rate < 90 ? "bad" : undefined}
        sub={[
          plural(task.failure_count, "failure"),
          task.retry_count ? plural(task.retry_count, "retry", "retries") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <Stat
        label="Median duration"
        value={formatMs(percentile(durations, 0.5))}
        sub={`p95 ${formatMs(percentile(durations, 0.95))} · max ${formatMs(durations[durations.length - 1])}`}
      />
      {topSkip ? (
        <Stat
          label="Skipped"
          value={formatCount(task.skipped_count)}
          sub={`${skips.length === 1 ? "" : "mostly "}${skipPhrase(topSkip.reason)}`}
        />
      ) : null}
    </StatGrid>
  );
}

/** `lock browser held`, `the circuit breaker`, … — a skip reason as it reads in a sentence. */
function skipPhrase(reason: string | null): string {
  const skip = readSkip(reason);
  if (skip.cause === "shouldSkip") return "by shouldSkip";
  if (skip.cause === "overlap") return "while still running";
  if (skip.cause === "breaker") return "by the breaker";
  if (skip.cause === "lock") return `lock ${skip.lock} busy`;
  return skip.short;
}

/** Why the task's runs were skipped, when there is more than one reason. */
function SkipBreakdown({ skips }: { skips: SkipCount[] }) {
  const total = skips.reduce((sum, s) => sum + s.count, 0);
  return (
    <section>
      <SectionTitle>Why runs were skipped</SectionTitle>
      <div className={css({ display: "flex", flexDir: "column", gap: "1.5", maxW: "560px" })}>
        {skips.map((skip) => (
          <div
            key={skip.reason ?? ""}
            className={css({ display: "flex", alignItems: "center", gap: "3", fontSize: "12px" })}
          >
            <span className={cx(truncate, css({ w: "220px", flexShrink: 0 }))}>
              {skip.reason ?? <span className={mono}>shouldSkip</span>}
            </span>
            <span className={css({ flex: "1", h: "6px", rounded: "full", bg: "hover" })}>
              <span
                className={css({ display: "block", h: "full", rounded: "full", bg: "faint" })}
                style={{ width: `${(skip.count / total) * 100}%` }}
              />
            </span>
            <span className={cx("num", css({ w: "40px", textAlign: "right", color: "muted" }))}>
              {formatCount(skip.count)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RunsTable({
  runs,
  now,
  latestVersion,
  versions,
  onOpen,
}: {
  runs: RunRow[];
  now: number;
  latestVersion: number;
  versions: number;
  onOpen: (id: number) => void;
}) {
  if (runs.length === 0) return <Empty title="No runs match" />;
  // Columns that would say the same thing on every row are left out.
  const showVersion = versions > 1;
  const showLogs = runs.some((run) => run.log_count > 0);
  const showTimings = runs.some((run) => run.timing_count > 0);
  return (
    <table className={table}>
      <thead>
        <tr>
          <th>Run</th>
          <th>Result</th>
          {showVersion ? <th>Version</th> : null}
          {showLogs ? <th className="num">Logs</th> : null}
          {showTimings ? <th className="num">Timings</th> : null}
          <th className="num">Duration</th>
          <th className="num">Started</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} data-link onClick={() => onOpen(run.id)}>
            <td>
              <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
                <Dot tone={runTone(run.status)} />
                <span className={mono}>#{run.id}</span>
              </div>
            </td>
            <td className={css({ maxW: "280px" })}>
              <RunOutcome run={run} />
            </td>
            {showVersion ? (
              <td
                className={cx(
                  mono,
                  run.version != null && run.version < latestVersion
                    ? css({ color: "faint" })
                    : undefined,
                )}
              >
                {run.version != null ? `v${run.version}` : "—"}
              </td>
            ) : null}
            {showLogs ? (
              <td className="num">
                <LogCount run={run} />
              </td>
            ) : null}
            {showTimings ? (
              <td className={cx("num", run.timing_count ? undefined : css({ color: "faint" }))}>
                {run.timing_count ? formatCount(run.timing_count) : "—"}
              </td>
            ) : null}
            <td className={cx("num", mono)}>{formatMs(run.duration_ms)}</td>
            <td className={cx("num", css({ color: "muted" }))}>{formatDateTime(now, run.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// -----------------------------------------------------------------------------
// Timings
// -----------------------------------------------------------------------------

function TimingsTab({ taskId, timings }: { taskId: number; timings: TimingStat[] }) {
  const navigate = useNavigate();
  if (timings.length === 0) {
    return (
      <Empty title="This task records no timings" icon={<IconClock size={22} />}>
        Wrap a stretch of work in <code>const end = ctx.timing.start("fetch")</code> …{" "}
        <code>await end()</code> and each label gets its record here.
      </Empty>
    );
  }
  return (
    <Card>
      <table className={table}>
        <thead>
          <tr>
            <th>Label</th>
            <th>Trend</th>
            <th className="num">Spans</th>
            <th className="num">Avg</th>
            <th className="num">p50</th>
            <th className="num">p95</th>
            <th className="num">Max</th>
            <th className="num">Latest</th>
          </tr>
        </thead>
        <tbody>
          {timings.map((t) => (
            <tr
              key={t.label}
              data-link
              title="Open the run with the latest span"
              onClick={() =>
                void navigate({
                  to: "/tasks/$taskId/runs/$runId",
                  params: { taskId: String(taskId), runId: String(t.last_run_id) },
                  search: { tab: "timings" },
                })
              }
            >
              <td className={cx(mono, css({ fontWeight: "600" }))}>{t.label}</td>
              <td>
                <Sparkline values={t.recent} />
              </td>
              <td className="num">{formatCount(t.count)}</td>
              <td className={cx("num", mono)}>{formatMs(t.avg)}</td>
              <td className={cx("num", mono)}>{formatMs(t.p50)}</td>
              <td className={cx("num", mono)}>{formatMs(t.p95)}</td>
              <td className={cx("num", mono)}>{formatMs(t.max)}</td>
              <td className={cx("num", mono)}>{formatMs(t.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Logs
// -----------------------------------------------------------------------------

/** Lines the Logs tab loads — the newest, across every run of the task. */
const TASK_LOG_WINDOW = 2000;

function LogsTab({ taskId }: { taskId: number }) {
  const { refreshKey } = usePrefs();
  const [logs, setLogs] = React.useState<LogRow[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getLogs({ data: { taskId, lifecycle: true, limit: TASK_LOG_WINDOW } }).then((rows) => {
      // Oldest first, the way a log reads.
      if (!cancelled) setLogs(rows.toReversed());
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  if (logs == null) return null;
  return (
    <LogList
      logs={logs}
      showRun
      lifecycleDefault={false}
      empty="This task has written no log lines"
    />
  );
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

function StoreTab({ keys, now }: { keys: KvRow[]; now: number }) {
  if (keys.length === 0) {
    return (
      <Empty title="Nothing stored" icon={<IconKey size={22} />}>
        A task keeps values between runs with <code>ctx.kv.set("cursor", value)</code>; they show up
        here as they stand now.
      </Empty>
    );
  }
  return (
    <Card>
      <KvTable
        rows={keys.map((k) => ({
          name: k.key,
          value: k.value == null ? "null" : prettyJson(k.value),
          extra: (
            <span className={css({ color: "faint", whiteSpace: "nowrap" })}>
              {formatAgo(now, k.created_at)}
            </span>
          ),
        }))}
        empty=""
        extraLabel="First set"
      />
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Versions
// -----------------------------------------------------------------------------

function VersionsTab({ details, now }: { details: TaskDetails; now: number }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { versions, code } = details;
  if (versions.length === 0) return <Empty title="No versions recorded" />;

  return (
    <div className={css({ display: "flex", flex: "1", minH: "0" })}>
      <div
        className={css({
          w: "380px",
          flexShrink: 0,
          overflow: "auto",
          borderRight: "1px solid",
          borderColor: "line",
        })}
      >
        <table className={table}>
          <thead>
            <tr>
              <th>Version</th>
              <th className="num">Runs</th>
              <th className="num">Failed</th>
              <th className="num">Avg</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr
                key={v.id}
                data-link
                aria-selected={v.id === code?.id}
                className={css({ "&[aria-selected=true] td": { bg: "selected" } })}
                onClick={() => void navigate({ search: (s) => ({ ...s, v: v.id }), replace: true })}
              >
                <td>
                  <div className={css({ display: "flex", flexDir: "column" })}>
                    <span className={cx(mono, css({ fontWeight: "600" }))}>v{v.version}</span>
                    <span className={css({ fontSize: "11px", color: "faint" })}>
                      {formatDateTime(now, v.created_at)}
                    </span>
                  </div>
                </td>
                <td className="num">{formatCount(v.run_count)}</td>
                <td className={cx("num", v.failure_count ? css({ color: "bad" }) : undefined)}>
                  {formatCount(v.failure_count)}
                </td>
                <td className={cx("num", mono)}>{formatMs(v.avg_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={css({ flex: "1", minW: "0", display: "flex", flexDir: "column" })}>
        {code ? (
          <CodeViewer
            code={code.compiled_code}
            caption={`v${code.version} · md5 ${code.md5_hash}`}
          />
        ) : (
          <Empty title="Pick a version" />
        )}
      </div>
    </div>
  );
}
