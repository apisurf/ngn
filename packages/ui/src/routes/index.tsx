// Overview: the scheduler at a glance, read top to bottom as three questions.
//
//   Is anything wrong?   a one-line verdict, then what needs attention: tasks
//                        whose latest run failed, and locks a stopped process
//                        left behind — each with what to look at next
//   What runs here?      every scheduled task, one row each: its schedule, its
//                        latest outcomes as a strip, when it last ran
//   How did today go?    runs per hour over the last day
//
// What one run did is a click away, in History or on the task; it is not
// repeated here.

import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { css, cx } from "styled-system/css";
import { ActivityChart, OutcomeStrip } from "~/components/charts";
import { IconCheckCircle, IconChevronRight, IconLock, IconXCircle } from "~/components/icons";
import {
  Card,
  Empty,
  mono,
  pagePad,
  Pill,
  scrollPane,
  SectionTitle,
  table,
  truncate,
} from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatAgo, formatCount, formatMs, formatSpan, plural } from "~/lib/format";
import { circuitOpen, describeTask } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import type { ActivityBucket, LockRow, OverviewTask, TaskItem } from "~/server/api";
import { getOverview } from "~/server/api";

const root = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  loader: () => getOverview(),
  staleTime: 0,
  component: OverviewPage,
});

/** Runs in each task's strip; the server sends at most this many. */
const STRIP_SLOTS = 24;

function OverviewPage() {
  useTab({ key: tabKey.overview(), title: "Overview", icon: "overview" });
  const unreadable = useUnreadable();
  const ws = root.useLoaderData();
  const now = useNow(ws.now);
  const data = Route.useLoaderData();

  if (unreadable) return unreadable;

  const extra = new Map(data.tasks.map((task) => [task.id, task]));
  const tasks = ws.tasks
    .filter((task) => !task.live)
    .toSorted((a, b) => a.path.localeCompare(b.path));
  const failing = tasks.filter((task) => extra.get(task.id)?.failing);
  // A lease is renewed while its holder lives; one past expiry was left behind.
  const stale = data.locks.filter((lock) => lock.expires_at <= now);
  const held = data.locks.filter((lock) => lock.expires_at > now);

  return (
    <div className={scrollPane}>
      <div className={pagePad}>
        <header>
          <h1 className={css({ fontSize: "18px", fontWeight: "600", m: "0" })}>Overview</h1>
          <Verdict tasks={tasks.length} failing={failing.length} stale={stale.length} />
          <DaySummary buckets={data.activity} />
        </header>

        {failing.length || stale.length ? (
          <section>
            <SectionTitle>Needs attention</SectionTitle>
            <Card>
              {failing.map((task) => (
                <FailingRow key={task.id} task={task} extra={extra.get(task.id)!} now={now} />
              ))}
              {stale.map((lock) => (
                <StaleLockRow key={lock.name} lock={lock} now={now} />
              ))}
            </Card>
          </section>
        ) : null}

        <section>
          <SectionTitle>Tasks</SectionTitle>
          <Card>
            {tasks.length === 0 ? (
              <Empty title="No tasks yet">Every task file ngn run schedules shows up here.</Empty>
            ) : (
              <TasksTable tasks={tasks} extra={extra} held={held} now={now} />
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Last 24 hours</SectionTitle>
          <ActivityChart buckets={data.activity} />
        </section>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// The verdict
// -----------------------------------------------------------------------------

function Verdict({ tasks, failing, stale }: { tasks: number; failing: number; stale: number }) {
  const problems = [
    failing ? `${plural(failing, "task")} failing` : null,
    stale ? `${plural(stale, "lock")} left behind` : null,
  ].filter(Boolean);
  const ok = problems.length === 0;
  return (
    <p
      className={cx(
        css({ display: "flex", alignItems: "center", gap: "1.5", m: "0", mt: "2" }),
        css({ fontSize: "14px", fontWeight: "500" }),
        ok ? css({ color: "ok" }) : css({ color: "bad" }),
      )}
    >
      {ok ? <IconCheckCircle size={16} /> : <IconXCircle size={16} />}
      {ok
        ? tasks
          ? `All ${plural(tasks, "task")} healthy`
          : "Nothing scheduled yet"
        : problems.join(" · ")}
    </p>
  );
}

/** The last day in one line, from the same buckets the chart draws. */
function DaySummary({ buckets }: { buckets: ActivityBucket[] }) {
  const sum = (key: keyof Omit<ActivityBucket, "from">) =>
    buckets.reduce((total, bucket) => total + bucket[key], 0);
  const succeeded = sum("success");
  const failed = sum("failure");
  const runs = succeeded + failed + sum("skipped") + sum("other");
  const decided = succeeded + failed;
  return (
    <p className={css({ color: "muted", fontSize: "12px", m: "0", mt: "1" })}>
      {runs === 0
        ? "No runs in the last 24 hours."
        : [
            `${plural(runs, "run")} in the last 24 hours`,
            decided ? `${Math.round((succeeded / decided) * 1000) / 10}% succeeded` : null,
            failed ? plural(failed, "failure") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
    </p>
  );
}

// -----------------------------------------------------------------------------
// Needs attention
// -----------------------------------------------------------------------------

const attentionRow = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2.5",
  px: "3",
  py: "2.5",
  borderBottom: "1px solid",
  borderColor: "line",
  color: "fg",
  textDecoration: "none",
  _hover: { bg: "hover" },
  _last: { borderBottom: "none" },
});

const rowSub = css({ display: "block", color: "muted", fontSize: "12px", mt: "0.5" });

/** A failing task: how long, how often, what it last said, and its latest failure a click away. */
function FailingRow({ task, extra, now }: { task: TaskItem; extra: OverviewTask; now: number }) {
  const spell = extra.failing!;
  return (
    <Link
      to="/tasks/$taskId/runs/$runId"
      params={{ taskId: String(task.id), runId: String(spell.last_run_id) }}
      className={attentionRow}
      title="Open its latest failed run"
    >
      <span className={css({ color: "bad", pt: "2px" })}>
        <IconXCircle size={15} />
      </span>
      <span className={css({ minW: "0", flex: "1" })}>
        <span className={css({ display: "flex", alignItems: "center", gap: "2" })}>
          <span className={css({ fontWeight: "600" })}>{task.file}</span>
          <span className={cx(truncate, css({ color: "faint", fontSize: "12px" }))}>
            {task.dir}
          </span>
          {circuitOpen(task) ? (
            <Pill tone="bad" title="ngn is skipping its ticks after repeated failures">
              Circuit open
            </Pill>
          ) : null}
        </span>
        <span className={rowSub}>
          Failing for {formatSpan(now - spell.since)} · {plural(spell.failures, "failed run")}
        </span>
        {spell.message ? (
          <span className={cx(truncate, mono, css({ display: "block", mt: "1" }))}>
            {spell.message}
          </span>
        ) : null}
      </span>
      <RowEnd>#{spell.last_run_id}</RowEnd>
    </Link>
  );
}

function StaleLockRow({ lock, now }: { lock: LockRow; now: number }) {
  const holder = lock.path ? describeTask(lock.path) : null;
  const body = (
    <>
      <span className={css({ color: "warn", pt: "2px" })}>
        <IconLock size={15} />
      </span>
      <span className={css({ minW: "0", flex: "1" })}>
        <span className={css({ display: "block" })}>
          Lock <span className={cx(mono, css({ fontWeight: "600" }))}>{lock.name}</span> left behind
        </span>
        <span className={rowSub}>
          {holder
            ? `${holder.live ? "A live editor run" : holder.file} stopped renewing it`
            : "Its holder stopped renewing it"}{" "}
          {formatAgo(now, lock.expires_at)}. It is free for the next run to take.
        </span>
      </span>
    </>
  );
  if (lock.task_id == null || lock.run_id == null)
    return <div className={attentionRow}>{body}</div>;
  return (
    <Link
      to="/tasks/$taskId/runs/$runId"
      params={{ taskId: String(lock.task_id), runId: String(lock.run_id) }}
      className={attentionRow}
      title="Open the run that held it"
    >
      {body}
      <RowEnd>#{lock.run_id}</RowEnd>
    </Link>
  );
}

function RowEnd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cx(
        mono,
        css({
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5",
          color: "faint",
          flexShrink: 0,
          pt: "1px",
        }),
      )}
    >
      {children}
      <IconChevronRight size={12} />
    </span>
  );
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

function TasksTable({
  tasks,
  extra,
  held,
  now,
}: {
  tasks: TaskItem[];
  extra: Map<number, OverviewTask>;
  held: LockRow[];
  now: number;
}) {
  const navigate = useNavigate();
  return (
    <table className={table}>
      <thead>
        <tr>
          <th>Task</th>
          <th>Schedule</th>
          <th>Latest runs</th>
          <th className="num">Last ran</th>
          <th className="num">Avg</th>
          <th className="num">Runs</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const row = extra.get(task.id);
          const locks = held.filter((lock) => lock.task_id === task.id).map((lock) => lock.name);
          return (
            <tr
              key={task.id}
              data-link
              onClick={() =>
                void navigate({ to: "/tasks/$taskId", params: { taskId: String(task.id) } })
              }
            >
              <td className={css({ maxW: "0", w: "full" })}>
                <div
                  className={css({ display: "flex", alignItems: "center", gap: "2", minW: "0" })}
                >
                  <span
                    className={cx(
                      css({ fontWeight: "500", flexShrink: 0 }),
                      task.last_outcome === "failure" ? css({ color: "bad" }) : undefined,
                    )}
                  >
                    {task.file}
                  </span>
                  <span className={cx(truncate, css({ color: "faint" }))}>{task.dir}</span>
                  {locks.length ? (
                    <span
                      title={`Holds ${locks.join(", ")} now`}
                      className={css({
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "1",
                        color: "muted",
                        fontSize: "11.5px",
                        flexShrink: 0,
                      })}
                    >
                      <IconLock size={11} />
                      {locks.join(", ")}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className={css({ color: "muted", whiteSpace: "nowrap" })}>
                {row?.schedule ?? "—"}
              </td>
              <td>
                <OutcomeStrip runs={row?.recent ?? []} slots={STRIP_SLOTS} />
              </td>
              <td className={cx("num", css({ color: "muted" }))}>
                {task.last_run_at ? formatAgo(now, task.last_run_at) : "never"}
              </td>
              <td className={cx("num", mono)}>{formatMs(task.avg_ms)}</td>
              <td className="num">{formatCount(task.run_count)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
