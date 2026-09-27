// History: every run of every task, newest first, under day headings — for when
// the question is "what just ran", not "how is this task doing".
//
// Filtering happens in SQL rather than over a loaded window, so a search finds
// last week's failure even when today's schedule ran a thousand times.

import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { DayRow, FeedFooter, FeedHeader, FeedSearch } from "~/components/feed";
import { IconHistory } from "~/components/icons";
import {
  Dot,
  Empty,
  mono,
  RunBadge,
  scrollPane,
  Segmented,
  table,
  Toggle,
  truncate,
} from "~/components/primitives";
import { useUnreadable } from "~/components/states";
import { formatClock, formatCount, formatMs, groupByDay } from "~/lib/format";
import { runTone } from "~/lib/ngn";
import { useNow } from "~/lib/prefs";
import { tabKey, useTab } from "~/lib/tabs";
import { getRuns } from "~/server/api";

const root = getRouteApi("__root__");

type Show = "all" | "failure" | "skipped" | "open";
const SHOWS: ReadonlySet<string> = new Set(["failure", "skipped", "open"]);

/** Runs the page lists at once. */
const LIMIT = 500;

interface HistorySearch {
  q?: string;
  show?: Exclude<Show, "all">;
  hideLive?: boolean;
}

export const Route = createFileRoute("/history")({
  validateSearch: (search: Record<string, unknown>): HistorySearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    show: SHOWS.has(search.show as string) ? (search.show as HistorySearch["show"]) : undefined,
    hideLive: search.hideLive === true ? true : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getRuns({ data: { q: deps.q, status: deps.show, hideLive: deps.hideLive, limit: LIMIT } }),
  staleTime: 0,
  component: HistoryPage,
});

function HistoryPage() {
  useTab({ key: tabKey.history(), title: "History", icon: "history" });
  const unreadable = useUnreadable();
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const rows = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter = React.useCallback(
    (next: Partial<HistorySearch>) =>
      void navigate({ search: (s) => ({ ...s, ...next }), replace: true }),
    [navigate],
  );
  const commitQ = React.useCallback((q: string) => filter({ q: q || undefined }), [filter]);

  if (unreadable) return unreadable;
  const show: Show = search.show ?? "all";
  const filtered = Boolean(search.q || search.show || search.hideLive);

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <FeedHeader title="History" subtitle="Every run of every task, newest first.">
        <FeedSearch value={search.q ?? ""} onCommit={commitQ} placeholder="Search task paths" />
        <Segmented
          items={[
            { id: "all", label: "All" },
            { id: "failure", label: "Failed" },
            { id: "skipped", label: "Skipped" },
            { id: "open", label: "Running" },
          ]}
          value={show}
          onSelect={(next) => filter({ show: next === "all" ? undefined : next })}
        />
        <Toggle
          checked={Boolean(search.hideLive)}
          onChange={(on) => filter({ hideLive: on || undefined })}
          label="Hide editor runs"
        />
      </FeedHeader>

      <div className={scrollPane}>
        {rows.length === 0 ? (
          <Empty title="No runs" icon={<IconHistory size={20} />}>
            {filtered
              ? "Nothing matches these filters."
              : "Nothing has run against this database yet."}
          </Empty>
        ) : (
          <>
            <table className={table}>
              <thead>
                <tr>
                  <th className="num" style={{ width: 80 }}>
                    Time
                  </th>
                  <th>Task</th>
                  <th>Result</th>
                  <th>Run</th>
                  <th className="num">Logs</th>
                  <th className="num">Duration</th>
                </tr>
              </thead>
              <tbody>
                {groupByDay(rows, now, (row) => row.at).map((group) => (
                  <React.Fragment key={group.day}>
                    <DayRow day={group.day} columns={6} />
                    {group.rows.map((row) => (
                      <tr
                        key={row.id}
                        data-link
                        title={`${row.path} · run #${row.id}`}
                        onClick={() =>
                          void navigate({
                            to: "/tasks/$taskId/runs/$runId",
                            params: { taskId: String(row.task_id), runId: String(row.id) },
                          })
                        }
                      >
                        <td className={cx("num", mono, css({ color: "muted" }))}>
                          {formatClock(row.at)}
                        </td>
                        <td className={css({ maxW: "0", w: "full" })}>
                          <div className={css({ display: "flex", gap: "2", minW: "0" })}>
                            <Dot tone={runTone(row.status)} />
                            <span className={cx(truncate, css({ fontWeight: "500" }))}>
                              {row.live ? "Live editor" : row.file}
                            </span>
                            {row.dir ? (
                              <span className={cx(truncate, css({ color: "faint" }))}>
                                {row.dir}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <RunBadge status={row.status} />
                        </td>
                        <td className={cx(mono, css({ color: "muted" }))}>#{row.id}</td>
                        <td className="num">
                          {formatCount(row.log_count)}
                          {row.error_count ? (
                            <span className={css({ color: "bad" })}> · {row.error_count}✕</span>
                          ) : row.warn_count ? (
                            <span className={css({ color: "warn" })}> · {row.warn_count}!</span>
                          ) : null}
                        </td>
                        <td className={cx("num", mono)}>{formatMs(row.duration_ms)}</td>
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
