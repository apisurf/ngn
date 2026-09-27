// The frame the History and Logs pages share: a title, a row of filters, and a
// table of rows under day headings, newest first.
//
// Filters live in the URL, so a tab reopens on what it was showing and Back
// undoes a filter. The search box types into local state and reaches the URL
// once typing pauses, so every keystroke is not a navigation.

import * as React from "react";
import { css } from "styled-system/css";
import { FilterInput } from "./primitives";

export function FeedHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <header className={css({ px: "5", pt: "4", pb: "3", flexShrink: 0 })}>
      <h1 className={css({ fontSize: "18px", fontWeight: "600", m: "0" })}>{title}</h1>
      <p className={css({ color: "muted", fontSize: "12px", m: "0", mt: "0.5" })}>{subtitle}</p>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          flexWrap: "wrap",
          mt: "3",
        })}
      >
        {children}
      </div>
    </header>
  );
}

/** The feed's search box, kept in step with a search param. */
export function FeedSearch({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
}) {
  const [text, setText] = React.useState(value);
  // Back and Forward change the param under the box.
  React.useEffect(() => setText(value), [value]);
  React.useEffect(() => {
    if (text === value) return;
    const timer = window.setTimeout(() => onCommit(text), 180);
    return () => window.clearTimeout(timer);
  }, [text, value, onCommit]);

  return (
    <FilterInput
      data-page-filter
      placeholder={placeholder}
      shortcut="/"
      value={text}
      onChange={(e) => setText(e.target.value)}
      className={css({ w: "320px", maxW: "full" })}
    />
  );
}

/** A day heading spanning the table, sticking under the column headings. */
export function DayRow({ day, columns }: { day: string; columns: number }) {
  return (
    <tr>
      <td
        colSpan={columns}
        className={css({
          position: "sticky",
          top: "29px",
          bg: "canvas",
          fontSize: "10.5px",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "faint",
          pt: "3",
          pb: "1",
        })}
      >
        {day}
      </td>
    </tr>
  );
}

export function FeedFooter({ shown, limit }: { shown: number; limit: number }) {
  if (shown < limit) return null;
  return (
    <p className={css({ color: "faint", fontSize: "12px", px: "5", py: "3", m: "0" })}>
      Showing the newest {limit}. Narrow the filters, or the SQL console reaches the rest.
    </p>
  );
}
