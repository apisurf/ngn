// A task's code, the way the database holds it and the way it was written.
//
// ngn stores each version as esbuild compiled it: the task wrapped in a module
// shim. "Source" peels the shim off, which reads as the file did; "Compiled" is
// the stored text, byte for byte, for when the shim is the question.

import * as React from "react";
import { css, cx } from "styled-system/css";
import { sourceOf } from "~/lib/ngn";
import { Button, CopyButton, faintText, mono, Segmented, truncate } from "./primitives";

type Mode = "source" | "compiled";

export function CodeViewer({ code, caption }: { code: string; caption?: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>("source");
  const source = React.useMemo(() => sourceOf(code), [code]);
  const text = mode === "source" ? source : code;

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          px: "3",
          py: "1.5",
          borderBottom: "1px solid",
          borderColor: "line",
          flexShrink: 0,
          minW: "0",
        })}
      >
        <Segmented
          items={[
            { id: "source", label: "Source", title: "The task, without esbuild's module wrapper" },
            { id: "compiled", label: "Compiled", title: "Exactly what the database stores" },
          ]}
          value={mode}
          onSelect={setMode}
        />
        <span
          className={cx(mono, faintText, truncate, css({ fontSize: "11px", flex: "1", minW: "0" }))}
        >
          {caption}
        </span>
        <CopyButton text={text} />
      </div>
      <div className={css({ flex: "1", minH: "0", overflow: "auto", bg: "well" })}>
        <Code text={text} />
      </div>
    </div>
  );
}

/** Lines past this render on request: a large bundle should not freeze the tab. */
const LINE_CAP = 4000;

/** Plain text with line numbers. */
export function Code({ text, wrap = false }: { text: string; wrap?: boolean }) {
  const [all, setAll] = React.useState(false);
  const lines = React.useMemo(() => text.split("\n"), [text]);
  const shown = all ? lines : lines.slice(0, LINE_CAP);
  const gutter = String(lines.length).length;

  return (
    <div
      className={cx(
        mono,
        css({ py: "2", lineHeight: "1.6" }),
        // Unwrapped lines scroll sideways as one block rather than each on its own.
        !wrap && css({ w: "max-content", minW: "full" }),
      )}
    >
      {shown.map((line, i) => (
        <div
          // Lines are positional by nature.
          key={i}
          className={css({ display: "flex", px: "3", _hover: { bg: "hover" } })}
        >
          <span
            className={css({
              color: "faint",
              textAlign: "right",
              pr: "3",
              userSelect: "none",
              flexShrink: 0,
            })}
            style={{ width: `${gutter + 2}ch` }}
          >
            {i + 1}
          </span>
          <span
            className={cx(
              css({ flex: "1", minW: "0" }),
              wrap
                ? css({ whiteSpace: "pre-wrap", wordBreak: "break-all" })
                : css({ whiteSpace: "pre" }),
            )}
          >
            {line || " "}
          </span>
        </div>
      ))}
      {!all && lines.length > LINE_CAP ? (
        <div className={css({ px: "3", py: "2" })}>
          <Button onClick={() => setAll(true)}>
            Show all {lines.length.toLocaleString("en-US")} lines
          </Button>
        </div>
      ) : null}
    </div>
  );
}
