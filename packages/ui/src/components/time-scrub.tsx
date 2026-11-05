// Runs over time above the Runs list: bars split by outcome, under every filter
// but the time ones, from the first matching run to now. Drag across it (or
// click one bar) to narrow the list to that window: the drag writes `since:`
// and `until:` into the filter, so the same window can also be typed, kept in
// a link, or copied to `ngn runs`.

import * as React from "react";
import { css, cx } from "styled-system/css";
import { formatDateTime, formatMs, parseRunQuery, plural } from "~/lib/ngn";
import { withWindow } from "~/lib/runs-query";
import type { RunActivity } from "~/server/api";
import { Legend } from "./charts";
import { Button, Card, TONE_BAR } from "./primitives";

export function TimeScrub({
  activity,
  value,
  onChange,
  now,
}: {
  activity: RunActivity;
  value: string;
  onChange: (value: string) => void;
  now: number;
}) {
  const { buckets, bucketMs } = activity;
  const bars = React.useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = React.useState<{ from: number; to: number } | null>(null);
  // The drag as the pointer handlers see it: a quick drag ends before React has
  // re-rendered with the state it started.
  const dragging = React.useRef<{ from: number; to: number } | null>(null);
  const track = (next: { from: number; to: number } | null) => {
    dragging.current = next;
    setDrag(next);
  };

  const tokens = parseRunQuery(value, now).tokens;
  const since = tokens.find((t) => t.key === "since");
  const until = tokens.find((t) => t.key === "until");
  const windowed = Boolean(since || until);

  if (buckets.length === 0) return null;
  const max = Math.max(1, ...buckets.map((b) => b.success + b.failure + b.skipped + b.other));

  /** The bucket under a pointer, clamped to the chart. */
  const indexAt = (clientX: number) => {
    const rect = bars.current!.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.9999);
    return Math.floor(ratio * buckets.length);
  };
  const selected = (i: number) => {
    if (drag) return i >= Math.min(drag.from, drag.to) && i <= Math.max(drag.from, drag.to);
    if (!windowed) return true;
    const start = buckets[i]!.from;
    const end = start + bucketMs;
    return (
      end > (since && "at" in since ? since.at : -Infinity) &&
      start < (until && "at" in until ? until.at : Infinity)
    );
  };

  return (
    <Card className={css({ p: "3" })}>
      <div
        ref={bars}
        role="img"
        aria-label={`Runs over time, ${plural(buckets.length, "bar")} of ${formatMs(bucketMs)}. Drag across to filter by time, or type since: and until: into the filter.`}
        onPointerDown={(event) => {
          event.preventDefault();
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          const i = indexAt(event.clientX);
          track({ from: i, to: i });
        }}
        onPointerMove={(event) => {
          const current = dragging.current;
          if (current) track({ ...current, to: indexAt(event.clientX) });
        }}
        onPointerUp={(event) => {
          const current = dragging.current;
          if (!current) return;
          const end = indexAt(event.clientX);
          const first = Math.min(current.from, end);
          const last = Math.max(current.from, end);
          track(null);
          onChange(
            withWindow(value, {
              since: buckets[first]!.from,
              until: buckets[last]!.from + bucketMs,
            }),
          );
        }}
        className={css({
          display: "flex",
          alignItems: "flex-end",
          gap: "1px",
          h: "64px",
          cursor: "crosshair",
          userSelect: "none",
          touchAction: "none",
        })}
      >
        {buckets.map((bucket, i) => {
          const total = bucket.success + bucket.failure + bucket.skipped + bucket.other;
          return (
            <div
              key={bucket.from}
              title={`${formatDateTime(now, bucket.from)} · ${plural(total, "run")}`}
              className={cx(
                css({
                  flex: "1",
                  h: "full",
                  display: "flex",
                  flexDir: "column-reverse",
                  rounded: "xs",
                  // A hairline where nothing ran, so the whole span reads as time to drag across.
                  borderBottom: "1px solid",
                  borderColor: "line",
                }),
                selected(i) ? undefined : css({ opacity: 0.3 }),
              )}
            >
              {(
                [
                  ["success", "ok"],
                  ["failure", "bad"],
                  ["skipped", "neutral"],
                  ["other", "info"],
                ] as const
              ).map(([key, tone]) =>
                bucket[key] ? (
                  <span
                    key={key}
                    className={cx(css({ display: "block", w: "full" }), TONE_BAR[tone])}
                    style={{ height: `${(bucket[key] / max) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
          );
        })}
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "4",
          mt: "1.5",
          fontSize: "11px",
          color: "muted",
          flexWrap: "wrap",
        })}
      >
        <span className={css({ fontFamily: "mono" })}>
          {formatDateTime(now, activity.from)} → now · {formatMs(bucketMs)} a bar
        </span>
        <Legend tone="ok" label="Succeeded" />
        <Legend tone="bad" label="Failed" />
        <Legend tone="neutral" label="Skipped" />
        <Legend tone="info" label="Running or stalled" />
        {windowed ? (
          <span className={css({ ml: "auto" })}>
            <Button onClick={() => onChange(withWindow(value, null))}>Every time</Button>
          </span>
        ) : (
          <span className={css({ ml: "auto", color: "faint" })}>Drag across to narrow by time</span>
        )}
      </div>
    </Card>
  );
}
