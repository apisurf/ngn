// Overview: the scheduler at a glance. What is in the file, how the last day
// went, what is failing, and what ran lately — the four things someone opening
// the database wants before they pick a task.

import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { css, cx } from "styled-system/css";
import { ActivityChart } from "~/components/charts";
import { IconCheckCircle, IconXCircle } from "~/components/icons";
import {
  Card,
  Dot,
  Empty,
  LevelBadge,
  mono,
  pagePad,
  RunBadge,
  scrollPane,
  SectionTitle,
  Stat,
  StatGrid,
  table,
  truncate,
} from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatAgo, formatBytes, formatCount, formatMs, plural } from "~/lib/format";
import { runTone } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import type { TaskItem, WorkspaceCounts } from "~/server/api";
import { getOverview } from "~/server/api";

const root = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  loader: () => getOverview(),
  staleTime: 0,
  component: OverviewPage,
});

/** Tasks listed as slowest. */
const SLOWEST = 8;

function OverviewPage() {
  useTab({ key: tabKey.overview(), title: "Overview", icon: "overview" });
  const unreadable = useUnreadable();
  const ws = root.useLoaderData();
  const now = useNow(ws.now);
  const navigate = useNavigate();
  const data = Route.useLoaderData();

  if (unreadable) return unreadable;
  const c = ws.counts;
  if (!c) return null;

  const scheduled = ws.tasks.filter((t) => !t.live);
  const failing = scheduled.filter((t) => t.last_outcome === "failure");
  const slowest = scheduled
    .filter((t) => t.avg_ms != null)
    .toSorted((a, b) => (b.avg_ms ?? 0) - (a.avg_ms ?? 0))
    .slice(0, SLOWEST);

  return (
    <div className={scrollPane}>
      <div className={pagePad}>
        <header>
          <h1 className={css({ fontSize: "18px", fontWeight: "600", m: "0" })}>Overview</h1>
          <p className={cx(mono, css({ color: "muted", m: "0", mt: "0.5" }))}>{ws.path}</p>
        </header>

        <WorkspaceStats counts={c} tasks={scheduled.length} fileBytes={ws.bytes} />

        <section>
          <SectionTitle>Last 24 hours</SectionTitle>
          <ActivityChart buckets={data.activity} />
        </section>

        <div
          className={css({
            display: "grid",
            gridTemplateColumns: { base: "1fr", xl: "3fr 2fr" },
            gap: "5",
          })}
        >
          <section>
            <SectionTitle>Recent runs</SectionTitle>
            <Card>
              {data.runs.length === 0 ? (
                <Empty title="Nothing has run yet" />
              ) : (
                <table className={table}>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Result</th>
                      <th className="num">Logs</th>
                      <th className="num">Duration</th>
                      <th className="num">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((run) => (
                      <tr
                        key={run.id}
                        data-link
                        onClick={() =>
                          void navigate({
                            to: "/tasks/$taskId/runs/$runId",
                            params: { taskId: String(run.task_id), runId: String(run.id) },
                          })
                        }
                      >
                        <td className={css({ maxW: "260px" })}>
                          <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
                            <Dot tone={runTone(run.status)} />
                            <span
                              className={cx(truncate, css({ fontWeight: "500" }))}
                              title={run.path}
                            >
                              {run.live ? "Live editor" : run.file}
                            </span>
                            <span className={cx(mono, css({ color: "faint" }))}>#{run.id}</span>
                          </div>
                        </td>
                        <td>
                          <RunBadge status={run.status} />
                        </td>
                        <td className="num">
                          {formatCount(run.log_count)}
                          {run.error_count ? (
                            <span className={css({ color: "bad" })}> · {run.error_count}✕</span>
                          ) : null}
                        </td>
                        <td className={cx("num", mono)}>{formatMs(run.duration_ms)}</td>
                        <td className={cx("num", css({ color: "muted" }))}>
                          {formatAgo(now, run.at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          <section className={css({ display: "flex", flexDir: "column", gap: "5" })}>
            <div>
              <SectionTitle>Failing tasks</SectionTitle>
              <Card>
                {failing.length === 0 ? (
                  <AllClear>Every task's latest run succeeded.</AllClear>
                ) : (
                  failing.map((task) => <FailingTask key={task.id} task={task} now={now} />)
                )}
              </Card>
            </div>

            <div>
              <SectionTitle>Warnings and errors</SectionTitle>
              <Card>
                {data.problems.length === 0 ? (
                  <AllClear>No task logged a warning or an error.</AllClear>
                ) : (
                  data.problems.map((log) => (
                    <Link
                      key={log.id}
                      to="/tasks/$taskId/runs/$runId"
                      params={{ taskId: String(log.task_id), runId: String(log.run_id) }}
                      search={{ tab: "logs", log: log.id }}
                      className={listRow}
                    >
                      <span className={css({ pt: "1px" })}>
                        <LevelBadge status={log.status} />
                      </span>
                      <span className={css({ minW: "0", flex: "1" })}>
                        <span className={cx(truncate, mono, css({ display: "block" }))}>
                          {log.value}
                        </span>
                        <span
                          className={css({ display: "block", color: "faint", fontSize: "11px" })}
                        >
                          {log.live ? "Live editor" : log.file} · run #{log.run_id} ·{" "}
                          {formatAgo(now, log.created_at)}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </Card>
            </div>
          </section>
        </div>

        <section>
          <SectionTitle>Slowest tasks</SectionTitle>
          <Card>
            {slowest.length === 0 ? (
              <Empty title="No finished runs yet" />
            ) : (
              <table className={table}>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th className="num">Runs</th>
                    <th className="num">Failed</th>
                    <th className="num">Avg</th>
                    <th className="num">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {slowest.map((task) => (
                    <tr
                      key={task.id}
                      data-link
                      onClick={() =>
                        void navigate({
                          to: "/tasks/$taskId",
                          params: { taskId: String(task.id) },
                        })
                      }
                    >
                      <td className={css({ maxW: "0", w: "full" })}>
                        <span className={cx(truncate, mono, css({ display: "block" }))}>
                          <span className={css({ color: "faint" })}>{task.dir}</span>
                          {task.file}
                        </span>
                      </td>
                      <td className="num">{formatCount(task.run_count)}</td>
                      <td
                        className={cx(
                          "num",
                          task.failure_count ? css({ color: "bad" }) : undefined,
                        )}
                      >
                        {formatCount(task.failure_count)}
                      </td>
                      <td className={cx("num", mono)}>{formatMs(task.avg_ms)}</td>
                      <td className={cx("num", mono)}>{formatMs(task.max_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

const listRow = css({
  display: "flex",
  gap: "2",
  px: "3",
  py: "2",
  borderBottom: "1px solid",
  borderColor: "line",
  color: "fg",
  textDecoration: "none",
  _hover: { bg: "hover" },
  _last: { borderBottom: "none" },
});

function AllClear({ children }: { children: React.ReactNode }) {
  return (
    <div className={css({ display: "flex", gap: "2", alignItems: "center", p: "3", color: "ok" })}>
      <IconCheckCircle size={16} /> {children}
    </div>
  );
}

function FailingTask({ task, now }: { task: TaskItem; now: number }) {
  const rate = task.success_count + task.failure_count;
  return (
    <Link to="/tasks/$taskId" params={{ taskId: String(task.id) }} className={listRow}>
      <span className={css({ color: "bad", pt: "1px" })}>
        <IconXCircle size={15} />
      </span>
      <span className={css({ minW: "0", flex: "1" })}>
        <span className={cx(truncate, css({ display: "block", fontWeight: "500" }))}>
          {task.file}
        </span>
        <span className={css({ display: "block", color: "faint", fontSize: "11px" })}>
          {task.dir || "./"} · {plural(task.failure_count, "failure")} in {plural(rate, "run")}
          {task.last_run_at ? ` · ${formatAgo(now, task.last_run_at)}` : ""}
        </span>
      </span>
    </Link>
  );
}

function WorkspaceStats({
  counts: c,
  tasks,
  fileBytes,
}: {
  counts: WorkspaceCounts;
  tasks: number;
  fileBytes: number;
}) {
  const decided = c.succeeded + c.failed;
  const rate = decided ? Math.round((c.succeeded / decided) * 1000) / 10 : null;
  return (
    <StatGrid>
      <Stat
        label="Tasks"
        value={formatCount(tasks)}
        sub={`${plural(c.versions, "version")} recorded`}
      />
      <Stat
        label="Runs"
        value={formatCount(c.runs)}
        sub={c.open ? `${formatCount(c.open)} running now` : `${formatCount(c.skipped)} skipped`}
      />
      <Stat
        label="Success rate"
        value={rate == null ? "—" : `${rate}%`}
        tone={rate == null ? undefined : c.failed ? (rate < 90 ? "bad" : "warn") : "ok"}
        sub={`${formatCount(c.succeeded)} of ${formatCount(decided)} finished`}
      />
      <Stat
        label="Failed runs"
        value={formatCount(c.failed)}
        tone={c.failed ? "bad" : "ok"}
        sub="threw, or a hook did"
      />
      <Stat
        label="Logs"
        value={formatCount(c.logs)}
        tone={c.errorLogs ? "warn" : undefined}
        sub={`${formatCount(c.warnLogs)} warnings · ${formatCount(c.errorLogs)} errors`}
      />
      <Stat
        label="Stored keys"
        value={formatCount(c.keys)}
        sub={`${plural(c.timings, "timing")} · ${formatBytes(fileBytes)} on disk`}
      />
    </StatGrid>
  );
}
