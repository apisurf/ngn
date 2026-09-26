// The SQL console: `ngn sql` in the browser, with the schema beside it.
//
// The connection is read-only at the SQLite level, so anything typed here can
// only ever read. The statement lives in the URL once run, so a query is a link.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { IconDatabase, IconPlay } from "~/components/icons";
import {
  Button,
  Callout,
  Empty,
  FilterInput,
  Kbd,
  mono,
  Pill,
  table,
  truncate,
} from "~/components/primitives";
import { Split } from "~/components/split";
import { formatMs } from "~/lib/format";
import { tabKey, useTab } from "~/lib/tabs";
import type { Cell, QueryResult, RelationSchema } from "~/server/api";
import { getSchema, runSql } from "~/server/api";

const EXAMPLES: { label: string; sql: string }[] = [
  {
    label: "Latest runs",
    sql: "SELECT r.id, t.path, r.status, r.ended_at - r.started_at AS ms\nFROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id\nORDER BY r.id DESC\nLIMIT 20",
  },
  {
    label: "Status per task",
    sql: "SELECT t.path, r.status, COUNT(*) AS n\nFROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id\nGROUP BY t.path, r.status\nORDER BY t.path, n DESC",
  },
  {
    label: "Errors logged",
    sql: "SELECT l.task_run_id, t.path, l.value, l.created_at\nFROM logs l JOIN file_tasks t ON t.id = l.file_task_id\nWHERE l.status = 'error' AND l.value <> 'Task failed'\nORDER BY l.id DESC\nLIMIT 50",
  },
  {
    label: "Slowest timings",
    sql: "SELECT t.path, m.label, COUNT(*) AS n, AVG(m.value) AS avg_ms, MAX(m.value) AS max_ms\nFROM timings m JOIN file_tasks t ON t.id = m.file_task_id\nGROUP BY t.path, m.label\nORDER BY avg_ms DESC",
  },
  {
    label: "Runs per hour",
    sql: "SELECT strftime('%Y-%m-%d %H:00', created_at / 1000, 'unixepoch', 'localtime') AS hour,\n       COUNT(*) AS runs, SUM(status = 'failure') AS failed\nFROM task_runs\nGROUP BY hour\nORDER BY hour DESC\nLIMIT 48",
  },
  {
    label: "Stored keys",
    sql: "SELECT t.path, k.key, k.value\nFROM kvs k JOIN file_tasks t ON t.id = k.file_task_id\nORDER BY t.path, k.key",
  },
];

export const Route = createFileRoute("/query")({
  validateSearch: (search: Record<string, unknown>): { sql?: string } => ({
    sql: typeof search.sql === "string" ? search.sql : undefined,
  }),
  loader: () => getSchema(),
  component: QueryPage,
});

function QueryPage() {
  useTab({ key: tabKey.query(), title: "SQL", icon: "query" });
  const schema = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [sql, setSql] = React.useState(search.sql ?? EXAMPLES[0]!.sql);
  const [result, setResult] = React.useState<QueryResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const editor = React.useRef<HTMLTextAreaElement>(null);

  const run = React.useCallback(
    async (statement: string) => {
      if (!statement.trim()) return;
      setRunning(true);
      try {
        setResult(await runSql({ data: { sql: statement } }));
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        setRunning(false);
      }
      void navigate({ search: { sql: statement }, replace: true });
    },
    [navigate],
  );

  // A shared link runs its query on arrival.
  const ranInitial = React.useRef(false);
  React.useEffect(() => {
    if (ranInitial.current || !search.sql) return;
    ranInitial.current = true;
    void run(search.sql);
  }, [search.sql, run]);

  const insert = (text: string) => {
    const el = editor.current;
    if (!el) return setSql((s) => s + text);
    const { selectionStart, selectionEnd } = el;
    const next = sql.slice(0, selectionStart) + text + sql.slice(selectionEnd);
    setSql(next);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + text.length, selectionStart + text.length);
    });
  };

  const editorPane = (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          px: "3",
          h: "40px",
          flexShrink: 0,
          borderBottom: "1px solid",
          borderColor: "line",
        })}
      >
        <Button
          onClick={() => void run(sql)}
          disabled={running}
          className={css({
            bg: "accent",
            color: "accentFg",
            borderColor: "accent",
            _hover: { bg: "accent", opacity: 0.9 },
          })}
        >
          <IconPlay size={12} />
          Run
        </Button>
        <Kbd>⌘ ↵</Kbd>
        <select
          aria-label="Example queries"
          value=""
          onChange={(e) => {
            const example = EXAMPLES.find((x) => x.label === e.target.value);
            if (example) setSql(example.sql);
          }}
          className={css({
            h: "28px",
            rounded: "md",
            border: "1px solid",
            borderColor: "line",
            bg: "raised",
            px: "1.5",
            fontSize: "12px",
          })}
        >
          <option value="">Examples…</option>
          {EXAMPLES.map((x) => (
            <option key={x.label} value={x.label}>
              {x.label}
            </option>
          ))}
        </select>
        <span className={css({ ml: "auto", color: "faint", fontSize: "12px" })}>
          Read-only connection
        </span>
      </div>
      <textarea
        ref={editor}
        value={sql}
        spellCheck={false}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run(sql);
          }
        }}
        className={cx(
          mono,
          css({
            flex: "1",
            minH: "0",
            resize: "none",
            border: "none",
            outline: "none",
            p: "3",
            bg: "well",
            fontSize: "13px",
            lineHeight: "1.6",
            tabSize: 2,
          }),
        )}
      />
    </div>
  );

  return (
    <div className={css({ display: "flex", h: "full", minH: "0" })}>
      <SchemaBrowser schema={schema} onInsert={insert} />
      <div
        className={css({
          flex: "1",
          minW: "0",
          display: "flex",
          borderLeft: "1px solid",
          borderColor: "line",
        })}
      >
        <Split
          direction="stacked"
          storageKey="query"
          initial={0.38}
          first={editorPane}
          second={<Results result={result} running={running} />}
        />
      </div>
    </div>
  );
}

function SchemaBrowser({
  schema,
  onInsert,
}: {
  schema: RelationSchema[];
  onInsert: (text: string) => void;
}) {
  const [filter, setFilter] = React.useState("");
  const [open, setOpen] = React.useState<string | null>("task_runs");
  const needle = filter.trim().toLowerCase();
  const visible = schema.filter(
    (r) => !needle || r.name.includes(needle) || r.columns.some((c) => c.name.includes(needle)),
  );

  return (
    <div
      className={css({
        w: "260px",
        flexShrink: 0,
        display: "flex",
        flexDir: "column",
        minH: "0",
        bg: "canvas",
      })}
    >
      <div className={css({ p: "2.5", flexShrink: 0 })}>
        <FilterInput
          placeholder="Filter tables and columns"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", px: "1.5", pb: "3" })}>
        {visible.map((relation) => {
          const expanded = open === relation.name || needle.length > 0;
          return (
            <div key={relation.name}>
              <button
                type="button"
                onClick={() => setOpen(expanded && !needle ? null : relation.name)}
                onDoubleClick={() => onInsert(relation.name)}
                title={relation.description ?? relation.name}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "1.5",
                  w: "full",
                  h: "26px",
                  px: "1.5",
                  rounded: "sm",
                  border: "none",
                  bg: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  _hover: { bg: "hover" },
                })}
              >
                <span
                  className={css({
                    color: relation.type === "view" ? "accent" : "faint",
                    display: "inline-flex",
                  })}
                >
                  <IconDatabase size={13} />
                </span>
                <span className={cx(mono, truncate, css({ flex: "1" }))}>{relation.name}</span>
                <Pill>{relation.type}</Pill>
              </button>
              {expanded ? (
                <div className={css({ pl: "6", pb: "1" })}>
                  {relation.description ? (
                    <div className={css({ color: "faint", fontSize: "11px", pr: "2", pb: "1" })}>
                      {relation.description}
                    </div>
                  ) : null}
                  {relation.columns
                    .filter(
                      (c) => !needle || relation.name.includes(needle) || c.name.includes(needle),
                    )
                    .map((column) => (
                      <button
                        key={column.name}
                        type="button"
                        onClick={() => onInsert(column.name)}
                        title={`Insert ${column.name}`}
                        className={css({
                          display: "flex",
                          w: "full",
                          gap: "2",
                          h: "22px",
                          alignItems: "center",
                          px: "1.5",
                          border: "none",
                          bg: "transparent",
                          rounded: "sm",
                          cursor: "pointer",
                          textAlign: "left",
                          _hover: { bg: "hover" },
                        })}
                      >
                        <span className={cx(mono, truncate, css({ flex: "1" }))}>
                          {column.name}
                        </span>
                        <span className={cx(mono, css({ color: "faint", fontSize: "10.5px" }))}>
                          {column.pk ? "pk " : ""}
                          {column.type || "?"}
                        </span>
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Results({ result, running }: { result: QueryResult | null; running: boolean }) {
  if (!result) {
    return (
      <Empty title="Run a query" icon={<IconDatabase size={22} />}>
        <span className={mono}>task_runs</span> joins to <span className={mono}>file_tasks</span> on{" "}
        <span className={mono}>file_task_id</span>; times are unix milliseconds. Click a column on
        the left to insert it.
      </Empty>
    );
  }
  if (!result.ok) {
    return (
      <div className={css({ p: "3" })}>
        <Callout tone="bad" title="Query failed">
          <span className={mono}>{result.error}</span>
        </Callout>
      </div>
    );
  }
  return (
    <div
      className={css({
        display: "flex",
        flexDir: "column",
        h: "full",
        minH: "0",
        opacity: running ? 0.6 : 1,
      })}
    >
      <div
        className={css({
          display: "flex",
          gap: "3",
          px: "3",
          h: "32px",
          alignItems: "center",
          flexShrink: 0,
          fontSize: "12px",
          color: "muted",
          borderBottom: "1px solid",
          borderColor: "line",
        })}
      >
        <span>
          {result.rows.length.toLocaleString("en-US")} row{result.rows.length === 1 ? "" : "s"}
          {result.truncated ? " (first 1,000)" : ""}
        </span>
        <span>{formatMs(result.ms)}</span>
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto" })}>
        {result.columns.length === 0 ? (
          <Empty title="No columns" />
        ) : (
          <table
            className={cx(
              table,
              css({
                w: "auto",
                minW: "full",
                "& td": { fontFamily: "mono", fontSize: "12px", maxW: "420px" },
              }),
            )}
          >
            <thead>
              <tr>
                {result.columns.map((c, i) => (
                  // Column names can repeat in a join.
                  <th key={`${c}:${i}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                // A result set has no identity beyond its position.
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={truncate} title={cell == null ? "NULL" : String(cell)}>
                      <CellValue value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === null)
    return <span className={css({ color: "faint", fontStyle: "italic" })}>NULL</span>;
  if (typeof value === "number")
    return <span className={css({ color: "synNumber" })}>{value}</span>;
  return <>{value}</>;
}
