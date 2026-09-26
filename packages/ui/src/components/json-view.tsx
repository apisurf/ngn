// A JSON tree: syntax-coloured, collapsible, lazy.
//
// Nodes below the initial depth render nothing until opened, so a megabyte of
// JSON costs the handful of rows on screen rather than the whole document. A
// collapsed node says what it holds (`{ 12 keys }`, `[ 30 items ]`), which is
// usually the answer someone opened the payload to get.

import * as React from "react";
import { css, cx } from "styled-system/css";
import type { JsonValue } from "~/lib/json";
import { IconChevronDown, IconChevronRight } from "./icons";

const syn = {
  key: css({ color: "synKey" }),
  string: css({ color: "synString" }),
  number: css({ color: "synNumber" }),
  bool: css({ color: "synBool" }),
  null: css({ color: "synNull" }),
  punct: css({ color: "synPunct" }),
};

const tree = css({
  fontFamily: "mono",
  fontSize: "12px",
  lineHeight: "1.65",
  py: "2",
  pl: "6",
  pr: "3",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

/** Imperative expand/collapse, bumped by the toolbar's buttons. */
export interface JsonViewCommand {
  open: boolean;
  seq: number;
}

export function JsonView({
  value,
  initialDepth = 2,
  command,
}: {
  value: JsonValue;
  initialDepth?: number;
  command?: JsonViewCommand;
}) {
  return (
    <div className={tree}>
      <Node value={value} depth={0} initialDepth={initialDepth} command={command} last />
    </div>
  );
}

function Node({
  name,
  value,
  depth,
  initialDepth,
  command,
  last,
}: {
  name?: string;
  value: JsonValue;
  depth: number;
  initialDepth: number;
  command?: JsonViewCommand;
  last: boolean;
}) {
  const branch = value !== null && typeof value === "object";
  const [open, setOpen] = React.useState(depth < initialDepth);

  React.useEffect(() => {
    if (command && command.seq > 0) setOpen(command.open);
  }, [command]);

  const label =
    name !== undefined ? (
      <>
        <span className={syn.key}>{JSON.stringify(name)}</span>
        <span className={syn.punct}>: </span>
      </>
    ) : null;
  const comma = last ? null : <span className={syn.punct}>,</span>;
  const indent = { paddingLeft: depth === 0 ? 0 : 16 };

  if (!branch) {
    return (
      <div style={indent}>
        {label}
        <Scalar value={value} />
        {comma}
      </div>
    );
  }

  const array = Array.isArray(value);
  const entries: [string | undefined, JsonValue][] = array
    ? value.map((v) => [undefined, v])
    : Object.entries(value);
  const [openBrace, closeBrace] = array ? ["[", "]"] : ["{", "}"];

  if (entries.length === 0) {
    return (
      <div style={indent}>
        {label}
        <span className={syn.punct}>{`${openBrace}${closeBrace}`}</span>
        {comma}
      </div>
    );
  }

  const summary = array
    ? `${entries.length} item${entries.length === 1 ? "" : "s"}`
    : `${entries.length} key${entries.length === 1 ? "" : "s"}`;

  return (
    <div style={indent}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className={css({
          cursor: "pointer",
          rounded: "xs",
          position: "relative",
          ml: "-14px",
          pl: "14px",
          _hover: { bg: "hover" },
        })}
      >
        <span
          className={css({
            position: "absolute",
            left: "0",
            top: "2px",
            color: "faint",
            display: "inline-flex",
          })}
        >
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        {label}
        <span className={syn.punct}>{openBrace}</span>
        {open ? null : (
          <>
            <span className={cx(css({ color: "faint", fontStyle: "italic", px: "1" }))}>
              {summary}
            </span>
            <span className={syn.punct}>{closeBrace}</span>
            {comma}
          </>
        )}
      </span>
      {open ? (
        <>
          {entries.map(([key, child], i) => (
            <Node
              // Arrays are positional; objects are keyed. Either way the pair is stable.
              key={key ?? i}
              name={key}
              value={child}
              depth={depth + 1}
              initialDepth={initialDepth}
              command={command}
              last={i === entries.length - 1}
            />
          ))}
          <div>
            <span className={syn.punct}>{closeBrace}</span>
            {comma}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Scalar({ value }: { value: JsonValue }) {
  if (value === null) return <span className={syn.null}>null</span>;
  if (typeof value === "string") return <span className={syn.string}>{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className={syn.number}>{String(value)}</span>;
  if (typeof value === "boolean") return <span className={syn.bool}>{String(value)}</span>;
  return null;
}
