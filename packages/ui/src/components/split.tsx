// Two panes and a draggable seam between them, side by side or stacked.
// The ratio is remembered per `storageKey`, so the editor/result split stays
// where it was put across pages and reloads.

import * as React from "react";
import { css, cx } from "styled-system/css";

const MIN = 0.15;
const MAX = 0.85;

function readRatio(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(`ngnui:split:${key}`));
    return value >= MIN && value <= MAX ? value : fallback;
  } catch {
    return fallback;
  }
}

export function Split({
  direction,
  first,
  second,
  initial = 0.5,
  storageKey,
}: {
  direction: "side" | "stacked";
  first: React.ReactNode;
  second: React.ReactNode;
  initial?: number;
  storageKey: string;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = React.useState(initial);
  const [dragging, setDragging] = React.useState(false);
  const side = direction === "side";

  React.useEffect(() => setRatio(readRatio(storageKey, initial)), [storageKey, initial]);

  const onPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging || !container.current) return;
    const box = container.current.getBoundingClientRect();
    const raw = side
      ? (event.clientX - box.left) / box.width
      : (event.clientY - box.top) / box.height;
    setRatio(Math.min(MAX, Math.max(MIN, raw)));
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    try {
      localStorage.setItem(`ngnui:split:${storageKey}`, String(ratio));
    } catch {
      // Remembered for this page only.
    }
  };

  const pane = css({
    minW: "0",
    minH: "0",
    overflow: "hidden",
    display: "flex",
    flexDir: "column",
  });

  return (
    <div
      ref={container}
      className={cx(
        css({ display: "flex", flex: "1", minH: "0", minW: "0", h: "full" }),
        side ? css({ flexDir: "row" }) : css({ flexDir: "column" }),
        dragging && css({ userSelect: "none", cursor: side ? "col-resize" : "row-resize" }),
      )}
    >
      <div className={pane} style={{ flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 0 }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={side ? "vertical" : "horizontal"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setRatio(initial)}
        className={cx(
          css({
            flexShrink: 0,
            bg: "line",
            position: "relative",
            transition: "background 80ms",
            _hover: { bg: "accent" },
            _after: { content: '""', position: "absolute" },
          }),
          side
            ? css({
                w: "1px",
                cursor: "col-resize",
                _after: { top: "0", bottom: "0", left: "-3px", right: "-3px" },
              })
            : css({
                h: "1px",
                cursor: "row-resize",
                _after: { left: "0", right: "0", top: "-3px", bottom: "-3px" },
              }),
          dragging && css({ bg: "accent" }),
        )}
      />
      <div className={cx(pane, css({ flex: "1" }))}>{second}</div>
    </div>
  );
}
