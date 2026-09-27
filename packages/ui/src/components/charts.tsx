// The three small charts the pages share: a task's runs as duration bars, the
// schedule's last day as stacked hourly bars, and a label's recent timings as
// a sparkline. Plain elements and inline SVG — no chart library for three
// shapes, and every colour is a theme token so both themes hold.

import { useNavigate } from "@tanstack/react-router";
import { css, cx } from "styled-system/css";
import { formatClock, formatMs, plural } from "~/lib/format";
import type { Tone } from "~/lib/ngn";
import { runLabel, runTone } from "~/lib/ngn";
import type { ActivityBucket, RunRow } from "~/server/api";
import { Card, TONE_BAR } from "./primitives";

// -----------------------------------------------------------------------------
// A task's runs, one bar each
// -----------------------------------------------------------------------------

/** Most recent {@link STRIP_RUNS} runs as bars, oldest on the left. */
const STRIP_RUNS = 60;

export function DurationStrip({ runs }: { runs: RunRow[] }) {
  const navigate = useNavigate();
  const shown = runs.slice(0, STRIP_RUNS).toReversed();
  const durations = shown.map((r) => r.duration_ms ?? 0);
  const max = Math.max(...durations, 1);

  return (
    <Card className={css({ p: "3" })}>
      <div className={css({ display: "flex", alignItems: "flex-end", gap: "2px", h: "88px" })}>
        {shown.map((run, i) => (
          <button
            key={run.id}
            type="button"
            title={`#${run.id} · ${runLabel(run.status)}${run.duration_ms != null ? ` · ${formatMs(run.duration_ms)}` : ""}`}
            onClick={() =>
              void navigate({
                to: "/tasks/$taskId/runs/$runId",
                params: { taskId: String(run.task_id), runId: String(run.id) },
              })
            }
            className={css({
              flex: "1",
              maxW: "22px",
              minW: "4px",
              h: "full",
              display: "flex",
              alignItems: "flex-end",
              border: "none",
              bg: "transparent",
              p: "0",
              cursor: "pointer",
              rounded: "xs",
              _hover: { bg: "hover" },
            })}
          >
            <span
              className={cx(
                css({ display: "block", w: "full", roundedTop: "sm" }),
                TONE_BAR[runTone(run.status)],
              )}
              style={{ height: `${Math.max((durations[i]! / max) * 100, 3)}%` }}
            />
          </button>
        ))}
      </div>
      <div
        className={css({
          display: "flex",
          gap: "4",
          mt: "2",
          fontSize: "11px",
          color: "muted",
          flexWrap: "wrap",
        })}
      >
        <span>max {formatMs(max)}</span>
        <Legend tone="ok" label="Succeeded" />
        <Legend tone="bad" label="Failed" />
        <Legend tone="neutral" label="Skipped" />
        <Legend tone="info" label="Running" />
      </div>
    </Card>
  );
}

export function Legend({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={css({ display: "inline-flex", alignItems: "center", gap: "1" })}>
      <span className={cx(css({ w: "8px", h: "8px", rounded: "xs" }), TONE_BAR[tone])} />
      {label}
    </span>
  );
}

// -----------------------------------------------------------------------------
// The last day, per hour
// -----------------------------------------------------------------------------

const STACK: { key: keyof Omit<ActivityBucket, "from">; tone: Tone }[] = [
  { key: "failure", tone: "bad" },
  { key: "other", tone: "info" },
  { key: "skipped", tone: "neutral" },
  { key: "success", tone: "ok" },
];

export function ActivityChart({ buckets }: { buckets: ActivityBucket[] }) {
  const totals = buckets.map((b) => b.success + b.failure + b.skipped + b.other);
  const max = Math.max(...totals, 1);
  const runs = totals.reduce((sum, n) => sum + n, 0);
  const failed = buckets.reduce((sum, b) => sum + b.failure, 0);

  return (
    <Card className={css({ p: "3" })}>
      <div className={css({ display: "flex", alignItems: "flex-end", gap: "3px", h: "72px" })}>
        {buckets.map((bucket, i) => (
          <div
            key={bucket.from}
            title={`${formatClock(bucket.from).slice(0, 5)} · ${plural(totals[i]!, "run")}${bucket.failure ? ` · ${bucket.failure} failed` : ""}`}
            className={css({
              flex: "1",
              h: "full",
              display: "flex",
              flexDir: "column",
              justifyContent: "flex-end",
              gap: "1px",
              rounded: "xs",
              _hover: { bg: "hover" },
            })}
          >
            {totals[i] === 0 ? (
              <span className={css({ display: "block", h: "2px", bg: "line", rounded: "full" })} />
            ) : (
              STACK.map(({ key, tone }) =>
                bucket[key] ? (
                  <span
                    key={key}
                    className={cx(
                      css({ display: "block", w: "full", rounded: "xs" }),
                      TONE_BAR[tone],
                    )}
                    style={{ height: `${(bucket[key] / max) * 100}%`, minHeight: 2 }}
                  />
                ) : null,
              )
            )}
          </div>
        ))}
      </div>
      <div
        className={css({
          display: "flex",
          justifyContent: "space-between",
          mt: "1.5",
          fontSize: "10.5px",
          color: "faint",
          fontFamily: "mono",
        })}
      >
        <span>{buckets[0] ? formatClock(buckets[0].from).slice(0, 5) : ""}</span>
        <span>now</span>
      </div>
      <div
        className={css({
          display: "flex",
          gap: "4",
          mt: "1.5",
          fontSize: "11px",
          color: "muted",
          flexWrap: "wrap",
        })}
      >
        <span>
          {plural(runs, "run")} · {plural(failed, "failure")} · busiest hour {formatCountShort(max)}
        </span>
        <Legend tone="ok" label="Succeeded" />
        <Legend tone="bad" label="Failed" />
        <Legend tone="neutral" label="Skipped" />
      </div>
    </Card>
  );
}

function formatCountShort(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US");
}

// -----------------------------------------------------------------------------
// A sparkline
// -----------------------------------------------------------------------------

/** Values as a line, scaled to their own range, the latest dotted. */
export function Sparkline({
  values,
  width = 120,
  height = 22,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className={css({ color: "accent", display: "block", overflow: "visible" })}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.8}
      />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.25} fill="currentColor" />
    </svg>
  );
}
