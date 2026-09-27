// The shared vocabulary. One thing is drawn one way everywhere: a run status is
// always a RunBadge, a sub-tab strip is always a TabList, a filter box is
// always a FilterInput — so two panes showing different data still read as one
// application.
//
// Panda extracts styles statically, so colour-by-value is done with lookup
// tables of pre-built classes rather than `css({ color: variable })`.

import * as React from "react";
import { css, cx } from "styled-system/css";
import type { LogLevel, Tone } from "~/lib/ngn";
import { LEVEL_TONE, logLevel, runLabel, runTone, seriesSlot } from "~/lib/ngn";
import { IconCheck, IconCopy, IconSearch } from "./icons";

export const mono = css({ fontFamily: "mono", fontSize: "12px" });
export const truncate = css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
export const faintText = css({ color: "faint" });
export const mutedText = css({ color: "muted" });

// -----------------------------------------------------------------------------
// Tones: run statuses, log levels, timing labels
// -----------------------------------------------------------------------------

const TONE_TEXT: Record<Tone, string> = {
  ok: css({ color: "ok" }),
  info: css({ color: "info" }),
  warn: css({ color: "warn" }),
  bad: css({ color: "bad" }),
  neutral: css({ color: "muted" }),
};

const TONE_PILL: Record<Tone, string> = {
  ok: css({ color: "ok", bg: "okSoft" }),
  info: css({ color: "info", bg: "accentSoft" }),
  warn: css({ color: "warn", bg: "warnSoft" }),
  bad: css({ color: "bad", bg: "badSoft" }),
  neutral: css({ color: "muted", bg: "hover" }),
};

const TONE_DOT: Record<Tone, string> = {
  ok: css({ bg: "ok" }),
  info: css({ bg: "info" }),
  warn: css({ bg: "warn" }),
  bad: css({ bg: "bad" }),
  neutral: css({ bg: "faint" }),
};

/** Solid fills, for bars and chart marks. */
export const TONE_BAR: Record<Tone, string> = TONE_DOT;

export function toneText(tone: Tone): string {
  return TONE_TEXT[tone];
}

/** `Failed` in a list, as a pill in a header. */
export function RunBadge({ status, pill = false }: { status: string | null; pill?: boolean }) {
  const tone = runTone(status);
  if (!pill) {
    return (
      <span
        className={cx(
          css({ fontWeight: "500", flexShrink: 0, whiteSpace: "nowrap" }),
          TONE_TEXT[tone],
        )}
      >
        {runLabel(status)}
      </span>
    );
  }
  return <Pill tone={tone}>{runLabel(status)}</Pill>;
}

const LEVEL_TEXT: Record<LogLevel, string> = { info: "INFO", warn: "WARN", error: "ERROR" };

/** A log line's level, fixed-width so a column of them lines the messages up. */
export function LevelBadge({ status }: { status: string }) {
  const level = logLevel(status);
  return (
    <span
      className={cx(
        css({
          display: "inline-block",
          w: "42px",
          flexShrink: 0,
          fontFamily: "mono",
          fontSize: "10.5px",
          fontWeight: "700",
          letterSpacing: "0.02em",
        }),
        level === "info" ? css({ color: "faint" }) : TONE_TEXT[LEVEL_TONE[level]],
      )}
    >
      {LEVEL_TEXT[level]}
    </span>
  );
}

const SERIES_BG = [
  css({ bg: "series1" }),
  css({ bg: "series2" }),
  css({ bg: "series3" }),
  css({ bg: "series4" }),
  css({ bg: "series5" }),
  css({ bg: "series6" }),
  css({ bg: "series7" }),
  css({ bg: "series8" }),
];

const SERIES_TEXT = [
  css({ color: "series1" }),
  css({ color: "series2" }),
  css({ color: "series3" }),
  css({ color: "series4" }),
  css({ color: "series5" }),
  css({ color: "series6" }),
  css({ color: "series7" }),
  css({ color: "series8" }),
];

/** The fill a timing label is drawn in, the same in every run. */
export function seriesBg(label: string): string {
  return SERIES_BG[seriesSlot(label, SERIES_BG.length)]!;
}

export function seriesText(label: string): string {
  return SERIES_TEXT[seriesSlot(label, SERIES_TEXT.length)]!;
}

export function Dot({ tone, title }: { tone: Tone; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        css({ display: "inline-block", w: "7px", h: "7px", rounded: "full", flexShrink: 0 }),
        TONE_DOT[tone],
      )}
    />
  );
}

export function Pill({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        css({
          display: "inline-flex",
          alignItems: "center",
          gap: "1",
          px: "1.5",
          py: "0",
          rounded: "sm",
          fontSize: "11px",
          fontWeight: "500",
          whiteSpace: "nowrap",
          lineHeight: "18px",
        }),
        TONE_PILL[tone],
      )}
    >
      {children}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Buttons
// -----------------------------------------------------------------------------

const buttonBase = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.5",
  h: "28px",
  px: "2.5",
  rounded: "md",
  border: "1px solid",
  borderColor: "line",
  bg: "raised",
  color: "fg",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: "500",
  fontSize: "12px",
  transition: "background 80ms",
  _hover: { bg: "hover" },
  _disabled: { opacity: 0.45, cursor: "default", _hover: { bg: "raised" } },
  _focusVisible: { outline: "2px solid", outlineColor: "accent", outlineOffset: "1px" },
});

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cx(buttonBase, className)} {...props} />;
}

const iconButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "28px",
  h: "28px",
  rounded: "md",
  border: "none",
  bg: "transparent",
  color: "muted",
  cursor: "pointer",
  flexShrink: 0,
  _hover: { bg: "hover", color: "fg" },
  _disabled: { opacity: 0.35, cursor: "default", _hover: { bg: "transparent" } },
  _focusVisible: { outline: "2px solid", outlineColor: "accent" },
  "&[aria-pressed=true]": { color: "accent", bg: "accentSoft" },
});

export function IconButton({
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(iconButton, className)}
      {...props}
    />
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string | null; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      disabled={text == null}
      onClick={() => {
        if (text == null) return;
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {copied ? "Copied" : label}
    </Button>
  );
}

// -----------------------------------------------------------------------------
// Tabs and segmented controls
// -----------------------------------------------------------------------------

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number | string;
  tone?: Tone;
  hidden?: boolean;
}

export function TabList<T extends string>({
  items,
  value,
  onSelect,
  right,
  dense = false,
}: {
  items: TabItem<T>[];
  value: T;
  onSelect: (id: T) => void;
  right?: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={css({
        display: "flex",
        alignItems: "stretch",
        gap: "0.5",
        px: "3",
        borderBottom: "1px solid",
        borderColor: "line",
        flexShrink: 0,
        minH: dense ? "34px" : "38px",
        overflowX: "auto",
        scrollbarWidth: "none",
      })}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(item.id)}
              className={css({
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: "1.5",
                px: "2",
                border: "none",
                bg: "transparent",
                cursor: "pointer",
                color: "muted",
                fontWeight: "500",
                whiteSpace: "nowrap",
                _hover: { color: "fg" },
                "&[aria-selected=true]": {
                  color: "fg",
                  _after: {
                    content: '""',
                    position: "absolute",
                    left: "2",
                    right: "2",
                    bottom: "-1px",
                    h: "2px",
                    rounded: "full",
                    bg: "accent",
                  },
                },
              })}
            >
              {item.label}
              {item.count !== undefined ? (
                <span
                  className={cx(
                    css({ fontSize: "11px", fontVariantNumeric: "tabular-nums" }),
                    item.tone ? TONE_TEXT[item.tone] : css({ color: "faint" }),
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      {right ? (
        <div
          className={css({
            ml: "auto",
            display: "flex",
            alignItems: "center",
            gap: "1.5",
            pl: "2",
          })}
        >
          {right}
        </div>
      ) : null}
    </div>
  );
}

/** A button that stays pressed: an on/off filter beside a Segmented. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={css({
        h: "26px",
        px: "2",
        rounded: "md",
        border: "1px solid",
        borderColor: "line",
        bg: "transparent",
        color: "muted",
        cursor: "pointer",
        fontSize: "12px",
        _hover: { color: "fg" },
        "&[aria-pressed=true]": { color: "accent", borderColor: "accent", bg: "accentSoft" },
      })}
    >
      {label}
    </button>
  );
}

export function Segmented<T extends string>({
  items,
  value,
  onSelect,
}: {
  items: { id: T; label: React.ReactNode; title?: string }[];
  value: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div
      className={css({
        display: "inline-flex",
        p: "2px",
        gap: "2px",
        rounded: "md",
        bg: "hover",
        flexShrink: 0,
      })}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.title}
          aria-pressed={item.id === value}
          onClick={() => onSelect(item.id)}
          className={css({
            display: "inline-flex",
            alignItems: "center",
            gap: "1",
            h: "22px",
            px: "2",
            rounded: "sm",
            border: "none",
            bg: "transparent",
            color: "muted",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "500",
            _hover: { color: "fg" },
            "&[aria-pressed=true]": {
              bg: "raised",
              color: "fg",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            },
          })}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inputs
// -----------------------------------------------------------------------------

export const FilterInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { shortcut?: string }
>(function FilterInput({ shortcut, className, ...props }, ref) {
  return (
    <label
      className={cx(
        css({
          display: "flex",
          alignItems: "center",
          gap: "1.5",
          h: "28px",
          px: "2",
          rounded: "md",
          border: "1px solid",
          borderColor: "line",
          bg: "canvas",
          color: "faint",
          minW: "0",
          _focusWithin: { borderColor: "accent", color: "muted" },
        }),
        className,
      )}
    >
      <IconSearch size={14} />
      <input
        ref={ref}
        type="search"
        spellCheck={false}
        autoComplete="off"
        className={css({
          flex: "1",
          minW: "0",
          border: "none",
          outline: "none",
          bg: "transparent",
          color: "fg",
          fontSize: "12px",
          "&::placeholder": { color: "faint" },
          "&::-webkit-search-cancel-button": { display: "none" },
        })}
        {...props}
      />
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </label>
  );
});

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={css({
        fontFamily: "mono",
        fontSize: "10px",
        color: "faint",
        border: "1px solid",
        borderColor: "line",
        rounded: "xs",
        px: "1",
        lineHeight: "16px",
        flexShrink: 0,
      })}
    >
      {children}
    </kbd>
  );
}

// -----------------------------------------------------------------------------
// Layout pieces
// -----------------------------------------------------------------------------

/** A number with a label under it — the header of every summary. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div
      className={css({
        display: "flex",
        flexDir: "column",
        gap: "0.5",
        px: "3.5",
        py: "2.5",
        rounded: "lg",
        border: "1px solid",
        borderColor: "line",
        bg: "raised",
        minW: "0",
      })}
    >
      <span className={css({ fontSize: "11px", color: "muted", fontWeight: "500" })}>{label}</span>
      <span
        className={cx(
          css({
            fontSize: "20px",
            fontWeight: "600",
            fontVariantNumeric: "tabular-nums",
            lineHeight: "1.2",
          }),
          tone ? TONE_TEXT[tone] : undefined,
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className={cx(css({ fontSize: "11px" }), faintText, truncate)}>{sub}</span>
      ) : null}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: "2.5",
      })}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "2", mb: "2", mt: "1" })}>
      <h2
        className={css({
          fontSize: "11px",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "muted",
          m: "0",
        })}
      >
        {children}
      </h2>
      {right ? <div className={css({ ml: "auto" })}>{right}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        css({
          rounded: "lg",
          border: "1px solid",
          borderColor: "line",
          bg: "raised",
          overflow: "hidden",
        }),
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Callout({
  tone,
  title,
  children,
  icon,
}: {
  tone: Tone;
  title: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        css({
          display: "flex",
          gap: "2.5",
          px: "3",
          py: "2.5",
          rounded: "md",
          alignItems: "flex-start",
        }),
        TONE_PILL[tone],
      )}
    >
      {icon ? <span className={css({ mt: "1px", flexShrink: 0 })}>{icon}</span> : null}
      <div className={css({ minW: "0", flex: "1" })}>
        <div className={css({ fontWeight: "600" })}>{title}</div>
        {children ? (
          <div className={css({ color: "fg", mt: "0.5", wordBreak: "break-word" })}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({
  title,
  children,
  icon,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={css({
        display: "flex",
        flexDir: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "1.5",
        px: "6",
        py: "10",
        color: "muted",
        h: "full",
        minH: "0",
      })}
    >
      {icon ? <div className={css({ color: "faint", mb: "1" })}>{icon}</div> : null}
      <div className={css({ fontWeight: "600", color: "fg", fontSize: "14px" })}>{title}</div>
      {children ? <div className={css({ maxW: "440px" })}>{children}</div> : null}
    </div>
  );
}

/** A table style shared by every grid of rows in the app. */
export const table = css({
  w: "full",
  borderCollapse: "separate",
  borderSpacing: "0",
  fontSize: "12.5px",
  "& th": {
    position: "sticky",
    top: "0",
    zIndex: "1",
    bg: "chrome",
    textAlign: "left",
    fontWeight: "500",
    fontSize: "11px",
    color: "muted",
    px: "3",
    py: "1.5",
    borderBottom: "1px solid",
    borderColor: "line",
    whiteSpace: "nowrap",
  },
  "& td": {
    px: "3",
    py: "1.5",
    borderBottom: "1px solid",
    borderColor: "line",
    verticalAlign: "middle",
  },
  "& tbody tr": { cursor: "default" },
  "& tbody tr[data-link]": { cursor: "pointer" },
  "& tbody tr:hover td": { bg: "hover" },
  "& td.num, & th.num": {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
});

/** A scrolling pane that fills its parent. */
export const scrollPane = css({ flex: "1", minH: "0", minW: "0", overflow: "auto" });

/** Padding for a page's scrolling content. */
export const pagePad = css({ px: "5", py: "4", display: "flex", flexDir: "column", gap: "5" });
