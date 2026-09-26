// History: every run of every task, newest first, under day headings — for when
// the question is "what just ran", not "how is this task doing".
//
// Filtering happens in SQL rather than over a loaded window, so a search finds
// last week's failure even when today's schedule ran a thousand times.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { useActive } from "~/lib/active";
import { formatClock, formatDayHeading, formatMs } from "~/lib/format";
import { runTone } from "~/lib/ngn";
import { useNow, usePrefs } from "~/lib/prefs";
import { tabKey, useTabs } from "~/lib/tabs";
import type { RunItem } from "~/server/api";
import { getRuns } from "~/server/api";
import { IconHistory } from "./icons";
import { Dot, Empty, FilterInput, mono, RunBadge, Segmented, truncate } from "./primitives";
import { treeRow } from "./sidebar-tasks";

const root = getRouteApi("__root__");

type Show = "all" | "failure" | "skipped" | "open";

export function HistoryPanel({
  filterRef,
}: {
  filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const { refreshKey } = usePrefs();
  const { pin } = useTabs();
  const active = useActive();
  const [q, setQ] = React.useState("");
  const [show, setShow] = React.useState<Show>("all");
  const [hideLive, setHideLive] = React.useState(false);
  const [rows, setRows] = React.useState<RunItem[] | null>(null);

  const debounced = useDebounced(q, 180);

  React.useEffect(() => {
    let cancelled = false;
    void getRuns({
      data: {
        q: debounced,
        status: show === "all" ? undefined : show,
        hideLive,
        limit: 500,
      },
    }).then((result) => {
      if (!cancelled) setRows(result);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, show, hideLive, refreshKey]);

  const grouped = React.useMemo(() => groupByDay(rows ?? [], now, (row) => row.at), [rows, now]);

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
          placeholder="Search task paths"
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
              { id: "failure", label: "Failed" },
              { id: "skipped", label: "Skipped" },
              { id: "open", label: "Running" },
            ]}
            value={show}
            onSelect={setShow}
          />
          <Toggle checked={hideLive} onChange={setHideLive} label="Hide editor" />
        </div>
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", px: "1.5", pb: "3" })}>
        {rows == null ? null : rows.length === 0 ? (
          <Empty title="No runs" icon={<IconHistory size={20} />}>
            {q || show !== "all" || hideLive
              ? "Nothing matches these filters."
              : "Nothing has run against this database yet."}
          </Empty>
        ) : (
          grouped.map((group) => (
            <div key={group.day}>
              <DayHeading>{group.day}</DayHeading>
              {group.rows.map((row) => (
                <Link
                  key={row.id}
                  to="/runs/$runId"
                  params={{ runId: String(row.id) }}
                  data-active={row.id === active.runId}
                  onDoubleClick={() => pin(tabKey.run(row.id))}
                  className={cx(
                    treeRow,
                    css({ h: "auto", py: "1", pl: "2", alignItems: "flex-start" }),
                  )}
                  title={`${row.path} · run #${row.id}`}
                >
                  <span className={css({ pt: "5px" })}>
                    <Dot tone={runTone(row.status)} />
                  </span>
                  <span
                    className={css({ flex: "1", minW: "0", display: "flex", flexDir: "column" })}
                  >
                    <span className={cx(truncate, css({ fontWeight: "500" }))}>
                      {row.live ? "Live editor" : row.file}
                    </span>
                    <span className={cx(truncate, css({ fontSize: "11px", color: "faint" }))}>
                      {formatClock(row.at)} · #{row.id}
                      {row.dir ? ` · ${row.dir}` : ""}
                    </span>
                  </span>
                  <span
                    className={css({
                      display: "flex",
                      flexDir: "column",
                      alignItems: "flex-end",
                      flexShrink: 0,
                      fontSize: "12px",
                    })}
                  >
                    <RunBadge status={row.status} />
                    <span className={cx(mono, css({ fontSize: "11px", color: "faint" }))}>
                      {row.duration_ms != null ? formatMs(row.duration_ms) : "—"}
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

export function groupByDay<T>(
  rows: readonly T[],
  now: number,
  at: (row: T) => number,
): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = formatDayHeading(now, at(row));
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else out.push({ day, rows: [row] });
  }
  return out;
}

export function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={css({
        position: "sticky",
        top: "0",
        zIndex: "1",
        bg: "chrome",
        fontSize: "10.5px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "faint",
        px: "2",
        pt: "2",
        pb: "1",
      })}
    >
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={css({
        h: "26px",
        px: "2",
        rounded: "md",
        border: "1px solid",
        borderColor: "line",
        bg: "transparent",
        color: "muted",
        cursor: "pointer",
        fontSize: "12px",
        _hover: { color: "fg" },
        "&[aria-pressed=true]": { color: "accent", borderColor: "accent", bg: "accentSoft" },
      })}
    >
      {label}
    </button>
  );
}

export function useDebounced<T>(value: T, ms: number): T {
  const [current, setCurrent] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return current;
}
