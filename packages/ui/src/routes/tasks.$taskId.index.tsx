// A task's tabs, under its header:
//
//   Runs       every execution, with a strip of durations so a bad afternoon
//              shows up before anyone reads a number; a row opens that run
//   Logs       every line it wrote, across runs
//   Timings    each `ctx.timing` label's record: count, p50, p95, the trend
//   Stored     what it keeps between runs with `ctx.kv`, as it stands now
//   Versions   each distinct build of the file, how its runs went, its code

import {
  createFileRoute,
  getRouteApi,
  Link,
  Navigate,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { DurationStrip, Sparkline } from "~/components/charts";
import { CodeViewer } from "~/components/code";
import { IconClock, IconKey } from "~/components/icons";
import { KvTable } from "~/components/kv-table";
import { LogList } from "~/components/log-list";
import {
  Card,
  Empty,
  mono,
  pagePad,
  scrollPane,
  SectionTitle,
  Stat,
  StatGrid,
  TabList,
  table,
  truncate,
} from "~/components/primitives";
import { formatAgo, formatCount, formatDateTime, formatMs, plural } from "~/lib/format";
import { prettyJson } from "~/lib/json";
import { percentile, readSkip } from "~/lib/ngn";
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
import { getLogs, getRunsPage, getTaskDetails } from "~/server/api";
import { RunsView } from "~/components/runs-view";

type TaskTab = "runs" | "logs" | "timings" | "keys" | "versions";
const TABS: ReadonlySet<string> = new Set(["logs", "timings", "keys", "versions"]);

const layout = getRouteApi("/tasks/$taskId");

/** Runs the task's Runs tab lists; its figures above are drawn from the details' window. */
const TASK_RUNS = 500;

export const Route = createFileRoute("/tasks/$taskId/")({
  validateSearch: (search: Record<string, unknown>): { tab?: TaskTab; v?: number; q?: string } => ({
    // "runs" is the default, so it never appears in the URL. `store` is what
    // Keys was called, and still opens it.
    tab:
      search.tab === "store"
        ? "keys"
        : TABS.has(search.tab as string)
          ? (search.tab as TaskTab)
          : undefined,
    v: typeof search.v === "number" && Number.isInteger(search.v) ? search.v : undefined,
    // The Runs tab's filter, in the language the Runs page and `ngn runs` take.
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ v: search.v, q: search.q }),
  loader: async ({ params, deps }) => {
    const [details, runsPage] = await Promise.all([
      getTaskDetails({ data: { taskId: params.taskId, versionId: deps.v } }),
      getRunsPage({ data: { query: deps.q ?? "", taskId: params.taskId, limit: TASK_RUNS } }),
    ]);
    if (!details) throw notFound();
    return { ...details, runsPage };
  },
  component: TaskPage,
});

function TaskPage() {
  const { task } = layout.useLoaderData();
  // An editor run's "task" is its throwaway file, with one run: show the run.
  if (task.editor && task.last_run_id != null) {
    return (
      <Navigate
        to="/tasks/$taskId/runs/$runId"
        params={{ taskId: String(task.id), runId: String(task.last_run_id) }}
        replace
      />
    );
  }
  return <ProjectTaskPage />;
}

function ProjectTaskPage() {
  const { task } = layout.useLoaderData();
  const details = Route.useLoaderData();
  const { timings, versions, keys } = details;
  const { tab = "runs" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const now = useNow(Date.now());
  useTab({
    key: tabKey.task(task.id),
    title: task.editor ? "Editor run" : task.file,
    icon: "task",
    failed: task.last_outcome === "failure",
  });

  return (
    <>
      <TabList
        items={[
          { id: "runs", label: "Runs", count: task.run_count },
          { id: "logs", label: "Logs", count: details.logCount },
          { id: "timings", label: "Timings", count: timings.length },
          { id: "keys", label: "Stored values", count: keys.length },
          { id: "versions", label: "Versions", count: versions.length },
        ]}
        value={tab}
        onSelect={(next) =>
          void navigate({ search: (s) => ({ ...s, tab: next === "runs" ? undefined : next }) })
        }
      />

      {tab === "runs" ? <RunsTab task={task} details={details} now={now} /> : null}
      {tab === "timings" ? (
        <div className={scrollPane}>
          <div className={pagePad}>
            <TimingsTab taskId={task.id} timings={timings} />
          </div>
        </div>
      ) : null}
      {tab === "logs" ? <LogsTab taskId={task.id} /> : null}
      {tab === "keys" ? (
        <div className={scrollPane}>
          <div className={pagePad}>
            <KeysTab keys={keys} now={now} />
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

/**
 * The task's figures, then the Runs view scoped to it: the same filter, facets
 * and rows as the Runs page, with `task:` fixed. Its filter can be carried to
 * the Runs page, where `task:` becomes an ordinary token.
 */
function RunsTab({
  task,
  details,
  now,
}: {
  task: TaskItem;
  details: ReturnType<typeof Route.useLoaderData>;
  now: number;
}) {
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onChange = React.useCallback(
    (next: string) =>
      void navigate({ search: (s) => ({ ...s, q: next || undefined }), replace: true }),
    [navigate],
  );
  if (details.runs.length === 0) return <Empty title="This task has not run yet" />;

  return (
    <RunsView
      page={details.runsPage}
      value={q}
      onChange={onChange}
      now={now}
      limit={TASK_RUNS}
      locked={`task:${task.path}`}
      showTask={false}
      showVersion={task.version_count > 1}
      aside={
        <Link
          to="/runs"
          search={{ q: [`task:${task.path}`, q].filter(Boolean).join(" ") }}
          className={css({ fontSize: "12px", color: "accent" })}
        >
          Open in Runs
        </Link>
      }
      lead={
        <>
          <TaskStats task={task} runs={details.runs} skips={details.skips} now={now} />
          <section>
            <SectionTitle>Duration per run</SectionTitle>
            <DurationStrip runs={details.runs} />
          </section>
          {details.skips.length > 1 ? <SkipBreakdown skips={details.skips} /> : null}
          <SectionTitle>All runs</SectionTitle>
        </>
      }
    />
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
// Keys
// -----------------------------------------------------------------------------

function KeysTab({ keys, now }: { keys: KvRow[]; now: number }) {
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
