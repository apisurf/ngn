// Where a page sits: `Tasks / extract.ts / Run #2`, every part but the last a
// link to its own page. It replaces the per-page back links, so the way up is
// in one place on every page.

import * as React from "react";
import { css } from "styled-system/css";

export const crumbLink = css({
  color: "muted",
  textDecoration: "none",
  _hover: { color: "accent", textDecoration: "underline" },
});

export function Breadcrumb({ children }: { children: React.ReactNode }) {
  const parts = React.Children.toArray(children).filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className={css({ fontSize: "12px", color: "muted", mb: "1" })}>
      <ol
        className={css({
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.5",
          listStyle: "none",
          m: "0",
          p: "0",
        })}
      >
        {parts.map((part, i) => (
          <li
            key={i}
            aria-current={i === parts.length - 1 ? "page" : undefined}
            className={css({ display: "inline-flex", alignItems: "center", gap: "1.5" })}
          >
            {i > 0 ? <span className={css({ color: "faint" })}>/</span> : null}
            {part}
          </li>
        ))}
      </ol>
    </nav>
  );
}
