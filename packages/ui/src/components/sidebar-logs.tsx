// Logs: every line every task wrote, newest first, searchable — for when the
// question is "where did that message come from", across every task at once.
//
// ngn's own lifecycle lines ("Task started", "Task succeeded", …) are hidden by
// default: a task's runs already say that, and they would outnumber what the
// task logged three to one.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { useActive } from "~/lib/active";
import { formatClock } from "~/lib/format";
import { useNow, usePrefs } from "~/lib/prefs";
import { tabKey, useTabs } from "~/lib/tabs";
import type { LogItem } from "~/server/api";
import { getLogs } from "~/server/api";
import { IconLogs } from "./icons";
import { Empty, FilterInput, LevelBadge, Segmented, truncate } from "./primitives";
import { DayHeading, groupByDay, Toggle, useDebounced } from "./sidebar-history";
import { treeRow } from "./sidebar-tasks";

const root = getRouteApi("__root__");

type Level = "all" | "warn" | "error";

export function LogsPanel({ filterRef }: { filterRef: React.RefObject<HTMLInputElement | null> }) {
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const { refreshKey } = usePrefs();
  const { pin } = useTabs();
  const active = useActive();
  const [q, setQ] = React.useState("");
  const [level, setLevel] = React.useState<Level>("all");
  const [lifecycle, setLifecycle] = React.useState(false);
  const [rows, setRows] = React.useState<LogItem[] | null>(null);

  const debounced = useDebounced(q, 180);

  React.useEffect(() => {
    let cancelled = false;
    void getLogs({
      data: {
        q: debounced,
        level: level === "all" ? undefined : level,
        lifecycle,
        limit: 500,
      },
    }).then((result) => {
      if (!cancelled) setRows(result);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, level, lifecycle, refreshKey]);

  const grouped = React.useMemo(
    () => groupByDay(rows ?? [], now, (row) => row.created_at),
    [rows, now],
  );

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <div
        className={css({
          px: "2.5",
          pb: "2",
          display: "flex",
          flexDir: "column",
          gap: "1.5",
          flexShrink: 0,
        })}
      >
        <FilterInput
          ref={filterRef}
          placeholder="Search messages and task paths"
          shortcut="/"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div
          className={css({ display: "flex", alignItems: "center", gap: "1.5", flexWrap: "wrap" })}
        >
          <Segmented
            items={[
              { id: "all", label: "All" },
              { id: "warn", label: "Warn+", title: "Warnings and errors" },
              { id: "error", label: "Errors" },
            ]}
            value={level}
            onSelect={setLevel}
          />
          <Toggle checked={lifecycle} onChange={setLifecycle} label="Lifecycle" />
        </div>
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", px: "1.5", pb: "3" })}>
        {rows == null ? null : rows.length === 0 ? (
          <Empty title="No log lines" icon={<IconLogs size={20} />}>
            {q || level !== "all"
              ? "Nothing matches these filters."
              : "Tasks write here with ctx.log.info, ctx.log.warning and ctx.log.error."}
          </Empty>
        ) : (
          grouped.map((group) => (
            <div key={group.day}>
              <DayHeading>{group.day}</DayHeading>
              {group.rows.map((row) => (
                <Link
                  key={row.id}
                  to="/runs/$runId"
                  params={{ runId: String(row.run_id) }}
                  search={{ tab: "logs", log: row.id }}
                  data-active={row.run_id === active.runId}
                  onDoubleClick={() => pin(tabKey.run(row.run_id))}
                  className={cx(
                    treeRow,
                    css({ h: "auto", py: "1", pl: "2", alignItems: "flex-start" }),
                  )}
                  title={row.value}
                >
                  <span className={css({ pt: "2px" })}>
                    <LevelBadge status={row.status} />
                  </span>
                  <span
                    className={css({ flex: "1", minW: "0", display: "flex", flexDir: "column" })}
                  >
                    <span
                      className={css({
                        fontFamily: "mono",
                        fontSize: "12px",
                        lineClamp: "2",
                        wordBreak: "break-word",
                      })}
                    >
                      {row.value}
                    </span>
                    <span className={cx(truncate, css({ fontSize: "11px", color: "faint" }))}>
                      {formatClock(row.created_at)} · {row.live ? "Live editor" : row.file} · #
                      {row.run_id}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
