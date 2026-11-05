// The Runs page keeps its filter in the URL as `q`, in the language `ngn runs` takes.

import { formatRunQuery, parseRunQuery } from "./ngn";

/** The filter as `q`, also from the separate params links carried before it. */
export function runsQueryOf(search: Record<string, unknown>): string | undefined {
  const parts = [typeof search.q === "string" ? search.q.trim() : ""];
  if (typeof search.status === "string") parts.push(`status:${search.status}`);
  if (search.origin === "scheduled" || search.origin === "editor")
    parts.push(`origin:${search.origin}`);
  if (search.hideLive === true) parts.push("origin:scheduled");
  return parts.filter(Boolean).join(" ") || undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-10-27T22:05`, local time: what `since:` and `until:` read back as the same moment. */
function localStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The filter with its time window replaced (or cleared, with `null`). */
export function withWindow(value: string, window: { since: number; until: number } | null): string {
  const tokens = parseRunQuery(value, Date.now()).tokens.filter(
    (t) => t.key !== "since" && t.key !== "until",
  );
  const text = formatRunQuery(tokens);
  if (!window) return text;
  return [text, `since:${localStamp(window.since)}`, `until:${localStamp(window.until)}`]
    .filter(Boolean)
    .join(" ");
}
