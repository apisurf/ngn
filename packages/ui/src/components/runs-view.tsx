// The Runs view: the filter bar, a count per status and origin, and the runs
// under day headings, newest first. The Runs page shows it across every task;
// a task's Runs tab shows it scoped to that task. One view, one way to filter.

import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { DayRow, FeedFooter } from "~/components/feed";
import { IconHistory } from "~/components/icons";
import {
  Dot,
  Empty,
  LogCount,
  mono,
  RunOutcome,
  scrollPane,
  table,
  truncate,
} from "~/components/primitives";
import { formatClock, formatMs, groupByDay } from "~/lib/format";
import { runMark } from "~/lib/ngn";
import type { RunsPage } from "~/server/api";
import { RunFacets, RunFilterBar } from "./run-filter";
import { TimeScrub } from "./time-scrub";

export function RunsView({
  page,
  value,
  onChange,
  now,
  limit,
  locked,
  showTask = true,
  showVersion = false,
  aside,
  lead,
  timeline = false,
}: {
  page: RunsPage;
  /** The filter as text. */
  value: string;
  onChange: (value: string) => void;
  now: number;
  /** Runs asked for; the footer says when there may be more. */
  limit: number;
  /** A token the view is scoped to, shown but not removable. */
  locked?: string;
  /** Whether rows name their task; not when the view is one task's. */
  showTask?: boolean;
  /** Each run's task version, for a task that has had more than one. */
  showVersion?: boolean;
  /** Beside the facets, e.g. a link to the same filter on the Runs page. */
  aside?: React.ReactNode;
  /** Above the filter, scrolling with the list: a task's own figures. */
  lead?: React.ReactNode;
  /** The runs-over-time chart, to narrow the list by dragging across it. */
  timeline?: boolean;
}) {
  const navigate = useNavigate();
  const rows = page.runs;

  // One toolbar row, as in an API client's history: the filter, then the facets
  // beside it, wrapping under it only when the pane is narrow.
  const controls = (
    <div
      className={css({
        display: "flex",
        flexDir: "column",
        gap: "2",
        px: lead ? "0" : "5",
        pt: lead ? "0" : "3",
        pb: "3",
        flexShrink: 0,
      })}
    >
      <div
        className={css({ display: "flex", alignItems: "flex-start", gap: "2", flexWrap: "wrap" })}
      >
        <div className={css({ flex: "1 1 320px", minW: "0" })}>
          <RunFilterBar value={value} onChange={onChange} errors={page.errors} locked={locked} />
        </div>
        <div className={css({ display: "flex", alignItems: "center", gap: "2", minH: "28px" })}>
          <RunFacets value={value} facets={page.facets} onChange={onChange} origins={showTask} />
          {aside}
        </div>
      </div>
      {timeline ? (
        <TimeScrub activity={page.activity} value={value} onChange={onChange} now={now} />
      ) : null}
    </div>
  );
  const columns = 4 + (showTask ? 1 : 0) + (showVersion ? 1 : 0);

  const list =
    rows.length === 0 ? (
      <Empty title="No runs" icon={<IconHistory size={20} />}>
        {value ? "Nothing matches this filter." : "Nothing has run against this database yet."}
      </Empty>
    ) : (
      <>
        <table className={table}>
          <thead>
            <tr>
              <th className="num" style={{ width: 80 }}>
                Time
              </th>
              {showTask ? <th>Task</th> : null}
              <th>Result</th>
              <th>Run</th>
              {showVersion ? <th>Version</th> : null}
              <th className="num">Logs</th>
              <th className="num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {groupByDay(rows, now, (row) => row.at).map((group) => (
              <React.Fragment key={group.day}>
                <DayRow day={group.day} columns={columns} />
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
                    {showTask ? (
                      <td className={css({ maxW: "0", w: "full" })}>
                        <div
                          className={css({
                            display: "flex",
                            alignItems: "center",
                            gap: "2",
                            minW: "0",
                          })}
                        >
                          <Dot tone={runMark(row.status, row.stalled)} />
                          <span className={cx(truncate, css({ fontWeight: "500" }))}>
                            {row.editor ? "Editor run" : row.file}
                          </span>
                          {row.dir ? (
                            <span className={cx(truncate, css({ color: "faint" }))}>{row.dir}</span>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    <td className={showTask ? css({ maxW: "260px" }) : css({ w: "full" })}>
                      <span
                        className={css({ display: "inline-flex", alignItems: "center", gap: "2" })}
                      >
                        {showTask ? null : <Dot tone={runMark(row.status, row.stalled)} />}
                        <RunOutcome run={row} />
                      </span>
                    </td>
                    <td className={cx(mono, css({ color: "muted" }))}>#{row.id}</td>
                    {showVersion ? (
                      <td className={cx(mono, css({ color: "muted" }))}>
                        {row.version == null ? "—" : `v${row.version}`}
                      </td>
                    ) : null}
                    <td className="num">
                      <LogCount run={row} />
                    </td>
                    <td className={cx("num", mono)}>{formatMs(row.duration_ms)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <FeedFooter shown={rows.length} limit={limit} />
      </>
    );

  // With a lead, the figures, the filter and the list scroll as one page;
  // without, the filter stays put above the list.
  if (lead) {
    return (
      <div className={scrollPane}>
        <div className={css({ px: "5", pt: "4", display: "flex", flexDir: "column", gap: "5" })}>
          {lead}
          {controls}
        </div>
        {list}
      </div>
    );
  }
  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      {controls}
      <div className={scrollPane}>{list}</div>
    </div>
  );
}
