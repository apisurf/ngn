// Logs: every line every task wrote, newest first, searchable — for when the
// question is "where did that message come from", across every task at once.
//
// ngn's own lifecycle lines ("Task started", "Task succeeded", …) are hidden by
// default: a task's runs already say that, and they would outnumber what the
// task logged three to one.

import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { DayRow, FeedFooter, FeedHeader, FeedSearch } from "~/components/feed";
import { IconLogs } from "~/components/icons";
import {
  Empty,
  LevelBadge,
  mono,
  scrollPane,
  Segmented,
  table,
  Toggle,
  truncate,
} from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatClock, groupByDay } from "~/lib/format";
import { isLifecycle } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import { getLogs } from "~/server/api";

const root = getRouteApi("__root__");

type Level = "all" | "warn" | "error";

/** Lines the page lists at once. */
const LIMIT = 500;

interface LogsSearch {
  q?: string;
  level?: Exclude<Level, "all">;
  lifecycle?: boolean;
}

export const Route = createFileRoute("/logs")({
  validateSearch: (search: Record<string, unknown>): LogsSearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    level: search.level === "warn" || search.level === "error" ? search.level : undefined,
    lifecycle: search.lifecycle === true ? true : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getLogs({
      data: { q: deps.q, level: deps.level, lifecycle: deps.lifecycle ?? false, limit: LIMIT },
    }),
  staleTime: 0,
  component: LogsPage,
});

function LogsPage() {
  useTab({ key: tabKey.logs(), title: "Logs", icon: "logs" });
  const unreadable = useUnreadable();
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const rows = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter = React.useCallback(
    (next: Partial<LogsSearch>) =>
      void navigate({ search: (s) => ({ ...s, ...next }), replace: true }),
    [navigate],
  );
  const commitQ = React.useCallback((q: string) => filter({ q: q || undefined }), [filter]);

  if (unreadable) return unreadable;
  const level: Level = search.level ?? "all";

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <FeedHeader title="Logs" subtitle="Every line every task wrote, newest first.">
        <FeedSearch
          value={search.q ?? ""}
          onCommit={commitQ}
          placeholder="Search messages and task paths"
        />
        <Segmented
          items={[
            { id: "all", label: "All" },
            { id: "warn", label: "Warn+", title: "Warnings and errors" },
            { id: "error", label: "Errors" },
          ]}
          value={level}
          onSelect={(next) => filter({ level: next === "all" ? undefined : next })}
        />
        <Toggle
          checked={Boolean(search.lifecycle)}
          onChange={(on) => filter({ lifecycle: on || undefined })}
          label="Lifecycle lines"
        />
      </FeedHeader>

      <div className={scrollPane}>
        {rows.length === 0 ? (
          <Empty title="No log lines" icon={<IconLogs size={20} />}>
            {search.q || search.level
              ? "Nothing matches these filters."
              : "Tasks write here with ctx.log.info, ctx.log.warning and ctx.log.error."}
          </Empty>
        ) : (
          <>
            <table className={table}>
              <thead>
                <tr>
                  <th className="num" style={{ width: 80 }}>
                    Time
                  </th>
                  <th style={{ width: 64 }}>Level</th>
                  <th>Message</th>
                  <th>Task</th>
                  <th>Run</th>
                </tr>
              </thead>
              <tbody>
                {groupByDay(rows, now, (row) => row.created_at).map((group) => (
                  <React.Fragment key={group.day}>
                    <DayRow day={group.day} columns={5} />
                    {group.rows.map((row) => (
                      <tr
                        key={row.id}
                        data-link
                        onClick={() =>
                          void navigate({
                            to: "/tasks/$taskId/runs/$runId",
                            params: { taskId: String(row.task_id), runId: String(row.run_id) },
                            search: { tab: "logs", log: row.id },
                          })
                        }
                      >
                        <td className={cx("num", mono, css({ color: "muted" }))}>
                          {formatClock(row.created_at)}
                        </td>
                        <td>
                          <LevelBadge status={row.status} />
                        </td>
                        <td className={css({ maxW: "0", w: "full" })}>
                          <span
                            title={row.value}
                            className={cx(
                              css({
                                fontFamily: "mono",
                                fontSize: "12px",
                                lineClamp: "2",
                                wordBreak: "break-word",
                              }),
                              isLifecycle(row.value) ? css({ color: "faint" }) : undefined,
                            )}
                          >
                            {row.value}
                          </span>
                        </td>
                        <td
                          className={cx(truncate, css({ maxW: "220px", fontWeight: "500" }))}
                          title={row.path}
                        >
                          {row.live ? "Live editor" : row.file}
                        </td>
                        <td className={cx(mono, css({ color: "muted" }))}>#{row.run_id}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <FeedFooter shown={rows.length} limit={LIMIT} />
          </>
        )}
      </div>
    </div>
  );
}
