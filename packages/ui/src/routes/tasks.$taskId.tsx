// A task: one file, across every run of it.
//
//   Runs       every execution, with a strip of durations so a bad afternoon
//              shows up before anyone reads a number
//   Timings    each `ctx.timing` label's record: count, p50, p95, the trend
//   Logs       every line it wrote, across runs
//   Store      its `ctx.kv` keys, as they stand now
//   Versions   each distinct build of the file, how its runs went, its code
//
// The schedule and hooks are read out of the newest version's compiled code:
// ngn keeps them nowhere else.

import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { DurationStrip, Sparkline } from "~/components/charts";
import { CodeViewer } from "~/components/code";
import { IconClock, IconCode, IconKey, IconTask } from "~/components/icons";
import { KvTable } from "~/components/kv-table";
import { LogList } from "~/components/log-list";
import {
  Card,
  Dot,
  Empty,
  mono,
  pagePad,
  Pill,
  RunBadge,
  scrollPane,
  SectionTitle,
  Segmented,
  Stat,
  StatGrid,
  TabList,
  table,
  truncate,
} from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatAgo, formatCount, formatDateTime, formatMs, plural } from "~/lib/format";
import { prettyJson } from "~/lib/json";
import { cronOf, describeCron, hooksOf, percentile, runTone } from "~/lib/ngn";
import { useNow, usePrefs } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import type { KvRow, LogRow, RunRow, TaskPage as TaskPageData, TimingStat } from "~/server/api";
import { getLogs, getTask } from "~/server/api";

type TaskTab = "runs" | "timings" | "logs" | "store" | "versions";
const TABS: ReadonlySet<string> = new Set(["timings", "logs", "store", "versions"]);

export const Route = createFileRoute("/tasks/$taskId")({
  validateSearch: (search: Record<string, unknown>): { tab?: TaskTab; v?: number } => ({
    // "runs" is the default, so it never appears in the URL.
    tab: TABS.has(search.tab as string) ? (search.tab as TaskTab) : undefined,
    v: typeof search.v === "number" && Number.isInteger(search.v) ? search.v : undefined,
  }),
  loaderDeps: ({ search }) => ({ v: search.v }),
  loader: async ({ params, deps }) => {
    const page = await getTask({ data: { taskId: params.taskId, versionId: deps.v } });
    if (!page) throw notFound();
    return page;
  },
  component: TaskPage,
});

function TaskPage() {
  const page = Route.useLoaderData();
  const { task, timings, versions, keys } = page;
  const { tab = "runs" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const unreadable = useUnreadable();
  const now = useNow(Date.now());
  useTab({
    key: tabKey.task(task.id),
    title: task.live ? "Live editor task" : task.file,
    icon: "task",
    failed: task.last_outcome === "failure",
  });

  if (unreadable) return unreadable;

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <TaskHeader page={page} now={now} />

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
            <RunsTab page={page} now={now} />
          </div>
        </div>
      ) : null}
      {tab === "timings" ? (
        <div className={scrollPane}>
          <div className={pagePad}>
            <TimingsTab timings={timings} />
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
      {tab === "versions" ? <VersionsTab page={page} now={now} /> : null}
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

// -----------------------------------------------------------------------------
// Runs
// -----------------------------------------------------------------------------

type Show = "all" | "failure" | "skipped";

function RunsTab({ page, now }: { page: TaskPageData; now: number }) {
  const navigate = useNavigate();
  const { task, runs } = page;
  const [show, setShow] = React.useState<Show>("all");
  if (runs.length === 0) return <Empty title="This task has not run yet" />;

  const durations = runs
    .map((r) => r.duration_ms)
    .filter((d): d is number => d != null)
    .toSorted((a, b) => a - b);
  const decided = task.success_count + task.failure_count;
  const rate = decided ? Math.round((task.success_count / decided) * 1000) / 10 : null;
  const visible = show === "all" ? runs : runs.filter((r) => r.status === show);

  return (
    <>
      <StatGrid>
        <Stat
          label="Runs"
          value={formatCount(task.run_count)}
          sub={`last ${formatAgo(now, runs[0]!.at)}`}
        />
        <Stat
          label="Success rate"
          value={rate == null ? "—" : `${rate}%`}
          tone={rate == null ? undefined : task.failure_count ? "bad" : "ok"}
          sub={`${plural(task.failure_count, "failure")} · ${formatCount(task.skipped_count)} skipped`}
        />
        <Stat
          label="Median duration"
          value={formatMs(percentile(durations, 0.5))}
          sub={`p95 ${formatMs(percentile(durations, 0.95))}`}
        />
        <Stat
          label="Slowest"
          value={formatMs(durations[durations.length - 1])}
          sub={`over the last ${plural(durations.length, "finished run")}`}
        />
      </StatGrid>

      <section>
        <SectionTitle>Duration per run</SectionTitle>
        <DurationStrip runs={runs} />
      </section>

      <section>
        <SectionTitle
          right={
            <Segmented
              items={[
                { id: "all", label: "All" },
                { id: "failure", label: `Failed ${task.failure_count}` },
                { id: "skipped", label: `Skipped ${task.skipped_count}` },
              ]}
              value={show}
              onSelect={setShow}
            />
          }
        >
          History
        </SectionTitle>
        <Card>
          <RunsTable
            runs={visible}
            now={now}
            latestVersion={task.version}
            onOpen={(id) => void navigate({ to: "/runs/$runId", params: { runId: String(id) } })}
          />
        </Card>
        {runs.length < task.run_count ? (
          <p className={css({ color: "faint", fontSize: "12px", mt: "2", mb: "0" })}>
            Showing the latest {formatCount(runs.length)} of {formatCount(task.run_count)} runs. The
            SQL console reaches the rest.
          </p>
        ) : null}
      </section>
    </>
  );
}

function RunsTable({
  runs,
  now,
  latestVersion,
  onOpen,
}: {
  runs: RunRow[];
  now: number;
  latestVersion: number;
  onOpen: (id: number) => void;
}) {
  if (runs.length === 0) return <Empty title="No runs match" />;
  return (
    <table className={table}>
      <thead>
        <tr>
          <th>Run</th>
          <th>Result</th>
          <th>Version</th>
          <th className="num">Logs</th>
          <th className="num">Timings</th>
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
            <td>
              <RunBadge status={run.status} />
            </td>
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
            <td className="num">
              {formatCount(run.log_count)}
              {run.error_count ? (
                <span className={css({ color: "bad" })}> · {run.error_count}✕</span>
              ) : run.warn_count ? (
                <span className={css({ color: "warn" })}> · {run.warn_count}!</span>
              ) : null}
            </td>
            <td className="num">{run.timing_count ? formatCount(run.timing_count) : "—"}</td>
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

function TimingsTab({ timings }: { timings: TimingStat[] }) {
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
                  to: "/runs/$runId",
                  params: { runId: String(t.last_run_id) },
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

function VersionsTab({ page, now }: { page: TaskPageData; now: number }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { versions, code } = page;
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
