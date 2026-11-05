// Pieces of a list of rows under day headings, newest first.

import { css } from "styled-system/css";

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
      Showing the newest {limit}. Narrow the filters, or <code>ngn sql</code> reaches the rest.
    </p>
  );
}
