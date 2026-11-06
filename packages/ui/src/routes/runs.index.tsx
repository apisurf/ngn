// Runs: every run of every task, newest first — for when the question is
// "what just ran", not "how is this task doing".
//
// The filter is the language `ngn runs` takes, kept in the URL as `q`, so a
// link or a reopened tab lands on the same view and the same text works in the
// terminal. Filtering happens in SQL, so a filter finds last week's failure
// even when today's schedule ran a thousand times.

import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css } from "styled-system/css";
import { visuallyHidden } from "~/components/primitives";
import { RunsView } from "~/components/runs-view";
import { useUnreadable } from "~/components/states";
import { useNow } from "~/lib/prefs";
import { runsQueryOf } from "~/lib/runs-query";
import { tabKey, useTab } from "~/lib/tabs";
import { getRunsPage } from "~/server/api";

const root = getRouteApi("__root__");

/** Runs the page lists at once. */
const LIMIT = 500;

export interface RunsSearch {
  q?: string;
}

export const Route = createFileRoute("/runs/")({
  validateSearch: (search: Record<string, unknown>): RunsSearch => ({ q: runsQueryOf(search) }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getRunsPage({ data: { query: deps.q ?? "", limit: LIMIT } }),
  staleTime: 0,
  component: RunsPage,
});

function RunsPage() {
  useTab({ key: tabKey.runs(), title: "Runs", icon: "runs" });
  const unreadable = useUnreadable();
  const ws = root.useLoaderData();
  const now = useNow(ws.now, 60_000);
  const page = Route.useLoaderData();
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onChange = React.useCallback(
    (next: string) => void navigate({ search: { q: next || undefined }, replace: true }),
    [navigate],
  );

  if (unreadable) return unreadable;
  // No heading: the sidebar says where this is, and the list starts under the
  // filter rather than under a title that repeats it.
  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <h1 className={visuallyHidden}>Runs</h1>
      <RunsView page={page} value={q} onChange={onChange} now={now} limit={LIMIT} timeline />
    </div>
  );
}
