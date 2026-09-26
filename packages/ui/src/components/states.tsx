// The pages shown instead of data: nothing recorded yet, a file that is not an
// ngn database, a link to something that is not there, an error.

import type { ErrorComponentProps } from "@tanstack/react-router";
import { getRouteApi, Link } from "@tanstack/react-router";
import type * as React from "react";
import { css, cx } from "styled-system/css";
import { IconAlert, IconDatabase } from "./icons";
import { Empty, mono } from "./primitives";

const root = getRouteApi("__root__");

export const command = cx(
  mono,
  css({
    display: "block",
    textAlign: "left",
    bg: "well",
    border: "1px solid",
    borderColor: "line",
    rounded: "md",
    px: "3",
    py: "2",
    mt: "3",
    whiteSpace: "pre-wrap",
  }),
);

export function NotFound() {
  return (
    <Empty title="Nothing here">
      That task or run is not in this database — it may be from another file.{" "}
      <Link to="/" className={css({ color: "accent" })}>
        Back to the overview
      </Link>
    </Empty>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <Empty title="Something went wrong reading the database" icon={<IconAlert size={22} />}>
      <pre className={cx(command, css({ color: "bad" }))}>
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </Empty>
  );
}

/**
 * What stands in for every page while there is nothing it could show: no file
 * yet, or a file that is not ngn's. Null otherwise, so a page returns it early
 * without knowing which case applies.
 */
export function useUnreadable(): React.ReactNode {
  const ws = root.useLoaderData();
  if (ws.schema.state === "missing") {
    return (
      <Empty title="No runs yet" icon={<IconDatabase size={24} />}>
        <p className={css({ m: "0" })}>
          ngnui is reading <span className={mono}>{ws.path}</span>, which has nothing in it yet.
          Start the scheduler with <span className={mono}>dbPath</span> pointing at this file and
          runs appear here — turn on <b>Live</b> to watch them land.
        </p>
        <code className={command}>ngn run</code>
      </Empty>
    );
  }
  if (ws.schema.state === "foreign") {
    return (
      <Empty title="This is not an ngn run database" icon={<IconAlert size={22} />}>
        <p className={css({ m: "0" })}>
          <span className={mono}>{ws.path}</span> has tables, but not ngn's — it is missing{" "}
          <span className={mono}>{ws.schema.missing.join(", ")}</span>. A task's own{" "}
          <span className={mono}>ctx.sqlite</span> file sits next to the task; the run database is
          the one <span className={mono}>dbPath</span> in ngn.config.ts names.
        </p>
        <code className={command}>ngnui --db ./ngn.sqlite</code>
      </Empty>
    );
  }
  return null;
}
