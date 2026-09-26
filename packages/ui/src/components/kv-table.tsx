// Name/value grids: a run's fields, a task's stored keys. Filterable, because
// a task with forty keys is common and the one you want is never first.

import * as React from "react";
import { css, cx } from "styled-system/css";
import { Empty, FilterInput, mono, table } from "./primitives";

export interface KvRow {
  name: string;
  value: string;
  /** Extra columns, e.g. cookie attributes. */
  extra?: React.ReactNode;
}

export function KvTable({
  rows,
  empty,
  filterable = rows.length > 8,
  nameLabel = "Key",
  valueLabel = "Value",
  extraLabel,
}: {
  rows: KvRow[];
  empty: string;
  filterable?: boolean;
  nameLabel?: string;
  valueLabel?: string;
  extraLabel?: string;
}) {
  const [filter, setFilter] = React.useState("");
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.value.toLowerCase().includes(needle),
      )
    : rows;

  if (rows.length === 0) return <Empty title={empty} />;

  return (
    <div className={css({ display: "flex", flexDir: "column", minH: "0" })}>
      {filterable ? (
        <div className={css({ px: "3", py: "2" })}>
          <FilterInput
            placeholder={`Filter ${rows.length} rows…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      ) : null}
      <table className={table}>
        <thead>
          <tr>
            <th className={css({ w: "32%" })}>{nameLabel}</th>
            <th>{valueLabel}</th>
            {extraLabel ? <th>{extraLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            // Rows can repeat a name, so the index is part of the identity.
            <tr key={`${row.name}:${i}`}>
              <td
                className={cx(
                  mono,
                  css({ color: "muted", verticalAlign: "top", wordBreak: "break-all" }),
                )}
              >
                {row.name}
              </td>
              <td className={cx(mono, css({ wordBreak: "break-all", whiteSpace: "pre-wrap" }))}>
                {row.value}
              </td>
              {extraLabel ? <td>{row.extra}</td> : null}
            </tr>
          ))}
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={extraLabel ? 3 : 2}
                className={css({ color: "faint", textAlign: "center" })}
              >
                Nothing matches “{filter}”.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
