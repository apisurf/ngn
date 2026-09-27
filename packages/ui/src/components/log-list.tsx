// Log lines, the way a terminal shows them: time, level, message — one per row,
// filterable by level and text, with ngn's lifecycle lines dimmed.
//
// A message that is a JSON object or array (tasks often log one) opens into a
// tree in place, since reading `{"rows":120,"totals":{…}}` on one line is what
// a structured log is meant to spare you.

import { Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { formatClockMs, formatOffset } from "~/lib/format";
import { parseStructured } from "~/lib/json";
import { isLifecycle, logLevel } from "~/lib/ngn";
import type { LogRow } from "~/server/api";
import { IconChevronDown, IconChevronRight, IconLogs } from "./icons";
import { JsonView } from "./json-view";
import { CopyButton, Empty, FilterInput, LevelBadge, mono, Segmented, Toggle } from "./primitives";

type Level = "all" | "warn" | "error";

export function LogList({
  logs,
  start,
  showRun = false,
  highlight,
  lifecycleDefault = true,
  empty,
}: {
  logs: LogRow[];
  /** When given, times are shown as offsets from it — a run's start. */
  start?: number | null;
  /** Link each line to its run: for lists that span runs. */
  showRun?: boolean;
  /** A line to scroll to and mark, e.g. from a search hit. */
  highlight?: number;
  lifecycleDefault?: boolean;
  empty: React.ReactNode;
}) {
  const [filter, setFilter] = React.useState("");
  const [level, setLevel] = React.useState<Level>("all");
  const [lifecycle, setLifecycle] = React.useState(lifecycleDefault);

  const needle = filter.trim().toLowerCase();
  const visible = logs.filter((log) => {
    const l = logLevel(log.status);
    if (level === "error" && l !== "error") return false;
    if (level === "warn" && l === "info") return false;
    if (!lifecycle && isLifecycle(log.value)) return false;
    return !needle || log.value.toLowerCase().includes(needle);
  });

  const hasLifecycle = logs.some((log) => isLifecycle(log.value));
  const counts = {
    warn: logs.filter((log) => logLevel(log.status) === "warn").length,
    error: logs.filter((log) => logLevel(log.status) === "error" && !isLifecycle(log.value)).length,
  };

  if (logs.length === 0) return <Empty title={empty} icon={<IconLogs size={22} />} />;

  return (
    <div className={css({ display: "flex", flexDir: "column", flex: "1", minH: "0" })}>
      <div
        className={css({
          display: "flex",
          gap: "2",
          px: "5",
          py: "2",
          alignItems: "center",
          flexShrink: 0,
          flexWrap: "wrap",
        })}
      >
        <FilterInput
          className={css({ w: "280px" })}
          placeholder="Filter messages"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Segmented
          items={[
            { id: "all", label: `All ${logs.length}` },
            { id: "warn", label: `Warn+ ${counts.warn + counts.error}` },
            { id: "error", label: `Errors ${counts.error}` },
          ]}
          value={level}
          onSelect={setLevel}
        />
        {hasLifecycle ? (
          <Toggle checked={lifecycle} onChange={setLifecycle} label="Lifecycle" />
        ) : null}
        <span className={css({ ml: "auto" })}>
          <CopyButton
            label="Copy lines"
            text={visible
              .map(
                (log) =>
                  `${formatClockMs(log.created_at)} ${logLevel(log.status).toUpperCase()} ${log.value}`,
              )
              .join("\n")}
          />
        </span>
      </div>
      <div
        className={css({
          flex: "1",
          minH: "0",
          overflow: "auto",
          bg: "well",
          borderTop: "1px solid",
          borderColor: "line",
        })}
      >
        <div className={css({ py: "1.5" })}>
          {visible.map((log) => (
            <LogLine
              key={log.id}
              log={log}
              start={start}
              showRun={showRun}
              highlighted={log.id === highlight}
            />
          ))}
          {visible.length === 0 ? (
            <div className={css({ color: "faint", textAlign: "center", py: "6" })}>
              No lines match.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LogLine({
  log,
  start,
  showRun,
  highlighted,
}: {
  log: LogRow;
  start?: number | null;
  showRun: boolean;
  highlighted: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const structured = React.useMemo(() => parseStructured(log.value), [log.value]);
  const [open, setOpen] = React.useState(false);
  const lifecycle = isLifecycle(log.value);
  const level = logLevel(log.status);

  React.useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center" });
  }, [highlighted]);

  return (
    <div
      ref={ref}
      data-highlighted={highlighted}
      className={cx(
        mono,
        css({
          display: "flex",
          alignItems: "flex-start",
          gap: "3",
          px: "5",
          py: "0.5",
          lineHeight: "1.6",
          _hover: { bg: "hover" },
          "&[data-highlighted=true]": { bg: "selected" },
        }),
        level === "error" && !lifecycle ? css({ bg: "badSoft" }) : undefined,
        level === "warn" ? css({ bg: "warnSoft" }) : undefined,
      )}
    >
      <span
        className={css({ color: "faint", flexShrink: 0, whiteSpace: "nowrap" })}
        title={formatClockMs(log.created_at)}
      >
        {start != null ? formatOffset(log.created_at - start) : formatClockMs(log.created_at)}
      </span>
      <LevelBadge status={log.status} />
      <div className={css({ flex: "1", minW: "0" })}>
        {structured === undefined ? (
          <span
            className={cx(
              css({ whiteSpace: "pre-wrap", wordBreak: "break-word" }),
              lifecycle ? css({ color: "faint", fontStyle: "italic" }) : undefined,
            )}
          >
            {log.value}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className={css({
                display: "inline-flex",
                alignItems: "flex-start",
                gap: "1",
                maxW: "full",
                p: "0",
                border: "none",
                bg: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "mono",
                fontSize: "12px",
                color: "fg",
              })}
            >
              <span className={css({ color: "faint", pt: "3px", flexShrink: 0 })}>
                {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              </span>
              <span
                className={cx(
                  open
                    ? css({ color: "muted" })
                    : css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
                )}
              >
                {open ? "JSON" : log.value}
              </span>
            </button>
            {open ? (
              <div className={css({ ml: "-6", mt: "0.5" })}>
                <JsonView value={structured} />
              </div>
            ) : null}
          </>
        )}
      </div>
      {showRun ? (
        <Link
          to="/tasks/$taskId/runs/$runId"
          params={{ taskId: String(log.task_id), runId: String(log.run_id) }}
          search={{ tab: "logs", log: log.id }}
          className={css({ color: "faint", flexShrink: 0, _hover: { color: "accent" } })}
        >
          #{log.run_id}
        </Link>
      ) : null}
    </div>
  );
}
