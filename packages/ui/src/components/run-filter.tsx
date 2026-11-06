// The Runs filter: one bar that takes the language `ngn runs` takes —
// `task:extract status:failed since:24h`, `-status:skipped`, plain words for
// task paths — with each understood token shown as a removable chip, and the
// keys and their values suggested as you type. Under it, each status and origin
// with how many runs picking it would show.

import { getRouteApi } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import type { FacetCounts } from "~/server/api";
import {
  formatRunQuery,
  ORIGIN_WORDS,
  parseRunQuery,
  RUN_QUERY_KEYS,
  RUN_STATUS_WORDS,
  type RunToken,
} from "~/lib/ngn";
import { formatCount } from "~/lib/format";
import { IconClose, IconSearch } from "./icons";
import { CopyButton, IconButton, Kbd, mono } from "./primitives";

const root = getRouteApi("__root__");

/** Typed text reaches the URL once typing pauses, so not every keystroke is a navigation. */
const COMMIT_DELAY_MS = 300;

const KEY_HINT: Record<(typeof RUN_QUERY_KEYS)[number], string> = {
  task: "a task name or part of a path",
  status: RUN_STATUS_WORDS.join(", "),
  origin: ORIGIN_WORDS.join(", "),
  since: "30m, 24h, 7d or a date",
  until: "the same, for the other end",
  version: "a version number",
};

const TIME_PRESETS = ["1h", "24h", "7d", "30d"];

interface Suggestion {
  /** What the draft becomes. */
  text: string;
  /** Whether picking it finishes a token (a chip) or only starts one (`status:`). */
  complete: boolean;
  hint?: string;
}

export function RunFilterBar({
  value,
  onChange,
  errors,
  locked,
}: {
  /** The filter as text, as kept in the URL. */
  value: string;
  onChange: (value: string) => void;
  errors: string[];
  /** A token the view is scoped to, shown but not removable (a task's own Runs tab). */
  locked?: string;
}) {
  const ws = root.useLoaderData();
  const [chips, setChips] = React.useState(value);
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const sent = React.useRef(value);
  const input = React.useRef<HTMLInputElement | null>(null);

  // Back and Forward change the filter under the bar; what this bar sent does not.
  React.useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setChips(value);
    setDraft("");
  }, [value]);

  const send = React.useCallback(
    (next: string) => {
      sent.current = next;
      onChange(next);
    },
    [onChange],
  );

  React.useEffect(() => {
    const next = join(chips, draft);
    if (next === sent.current) return;
    const timer = window.setTimeout(() => send(next), COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [chips, draft, send]);

  const tokens = React.useMemo(() => parseRunQuery(chips, Date.now()).tokens, [chips]);

  const commit = (text: string) => {
    const next = join(chips, text);
    setChips(next);
    setDraft("");
    send(next);
  };
  const remove = (index: number) => {
    const next = formatRunQuery(tokens.filter((_, i) => i !== index));
    setChips(next);
    send(join(next, draft));
  };

  const taskNames = React.useMemo(
    () => [
      ...new Set(ws.tasks.filter((t) => !t.editor).map((t) => t.file.replace(/\.[jt]s$/, ""))),
    ],
    [ws.tasks],
  );
  const suggestions = focused ? suggest(draft, taskNames) : [];

  const pick = (suggestion: Suggestion) => {
    if (suggestion.complete) commit(suggestion.text);
    else setDraft(suggestion.text);
    setActive(-1);
    input.current?.focus();
  };

  return (
    <div className={css({ position: "relative", flex: "1", minW: "280px", maxW: "720px" })}>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1",
          minH: "32px",
          px: "2",
          py: "1",
          border: "1px solid",
          borderColor: focused ? "accent" : "line",
          rounded: "md",
          bg: "raised",
          cursor: "text",
        })}
        onClick={() => input.current?.focus()}
      >
        <span className={css({ color: "faint", display: "inline-flex" })}>
          <IconSearch size={14} />
        </span>
        {locked ? <Chip text={locked} /> : null}
        {tokens.map((token, i) => (
          <Chip
            key={`${i}:${token.key}:${token.value}`}
            text={formatRunQuery([token])}
            negate={token.negate}
            onRemove={() => remove(i)}
          />
        ))}
        <input
          ref={input}
          data-page-filter
          aria-label="Filter runs"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          placeholder={
            tokens.length || locked ? "" : "Filter: task:extract status:failed since:24h"
          }
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) commit(draft);
          }}
          onChange={(event) => {
            const text = event.target.value;
            setActive(-1);
            // A space after a finished word makes it a chip, unless a quote is open.
            if (text.endsWith(" ") && (text.match(/"/g)?.length ?? 0) % 2 === 0) {
              if (text.trim()) commit(text.trim());
              return;
            }
            setDraft(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length) {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp" && suggestions.length) {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, -1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const suggestion = suggestions[active];
              if (suggestion) pick(suggestion);
              else if (draft.trim()) commit(draft.trim());
            } else if (event.key === "Backspace" && !draft && tokens.length) {
              remove(tokens.length - 1);
            } else if (event.key === "Escape") {
              (event.target as HTMLInputElement).blur();
            }
          }}
          className={css({
            flex: "1",
            minW: "120px",
            border: "none",
            outline: "none",
            bg: "transparent",
            color: "fg",
            fontSize: "12.5px",
            fontFamily: "mono",
            h: "22px",
          })}
        />
        <Kbd>/</Kbd>
      </div>
      {suggestions.length ? (
        <ul
          role="listbox"
          aria-label="Suggestions"
          className={css({
            position: "absolute",
            zIndex: "10",
            top: "calc(100% + 4px)",
            left: "0",
            minW: "320px",
            m: "0",
            p: "1",
            listStyle: "none",
            bg: "raised",
            border: "1px solid",
            borderColor: "line",
            rounded: "md",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
            fontSize: "12.5px",
          })}
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.text}
              role="option"
              aria-selected={i === active}
              // Before the input's blur, which would commit the draft first.
              onPointerDown={(event) => {
                event.preventDefault();
                pick(suggestion);
              }}
              className={css({
                display: "flex",
                gap: "3",
                px: "2",
                py: "1",
                rounded: "sm",
                cursor: "pointer",
                "&[aria-selected=true], &:hover": { bg: "hover" },
              })}
            >
              <span className={mono}>{suggestion.text}</span>
              {suggestion.hint ? (
                <span className={css({ color: "faint" })}>{suggestion.hint}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {errors.length ? (
        <ul
          className={css({
            m: "0",
            mt: "1",
            p: "0",
            listStyle: "none",
            color: "bad",
            fontSize: "12px",
          })}
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Filter words joined into one filter, empty ones left out. */
function join(...parts: string[]): string {
  return parts
    .filter((p) => p.trim())
    .join(" ")
    .trim();
}

/** What to offer for the word being typed: the keys, then a key's values. */
function suggest(draft: string, taskNames: string[]): Suggestion[] {
  const negate = draft.startsWith("-") ? "-" : "";
  const body = draft.slice(negate.length);
  const colon = body.indexOf(":");
  if (colon < 0) {
    return RUN_QUERY_KEYS.filter((key) => key.startsWith(body.toLowerCase()))
      .filter((key) => !(negate && (key === "since" || key === "until")))
      .map((key) => ({ text: `${negate}${key}:`, complete: false, hint: KEY_HINT[key] }));
  }
  const key = body.slice(0, colon).toLowerCase();
  const typed = body.slice(colon + 1).toLowerCase();
  const values =
    key === "status"
      ? RUN_STATUS_WORDS
      : key === "origin"
        ? ORIGIN_WORDS
        : key === "since" || key === "until"
          ? TIME_PRESETS
          : key === "task"
            ? taskNames
            : [];
  return values
    .filter((value) => value.toLowerCase().startsWith(typed) && value.toLowerCase() !== typed)
    .slice(0, 8)
    .map((value) => ({ text: `${negate}${key}:${value}`, complete: true }));
}

function Chip({
  text,
  negate,
  onRemove,
}: {
  text: string;
  negate?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cx(
        mono,
        css({
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5",
          h: "22px",
          pl: "2",
          pr: onRemove ? "0.5" : "2",
          rounded: "sm",
          fontSize: "12px",
          bg: negate ? "badSoft" : "selected",
          color: "fg",
          whiteSpace: "nowrap",
        }),
      )}
      title={onRemove ? undefined : "This view is scoped to it"}
    >
      {text}
      {onRemove ? (
        <IconButton
          label={`Remove ${text}`}
          className={css({ w: "18px", h: "18px" })}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <IconClose size={10} />
        </IconButton>
      ) : null}
    </span>
  );
}

/** Facet order: what needs looking at first. */
const ORDER = ["failed", "stalled", "skipped", "running", "succeeded"] as const;

const STATUS_LABEL: Record<(typeof RUN_STATUS_WORDS)[number], string> = {
  failed: "Failed",
  stalled: "Stalled",
  skipped: "Skipped",
  running: "Running",
  succeeded: "Succeeded",
};

/**
 * Each status and origin with its count under the other filters: the views to
 * reach for. Picking one makes it that facet's only value; picking it again
 * clears the facet.
 */
export function RunFacets({
  value,
  facets,
  onChange,
  origins = true,
}: {
  value: string;
  facets: FacetCounts;
  onChange: (value: string) => void;
  origins?: boolean;
}) {
  const tokens = parseRunQuery(value, Date.now()).tokens;
  const only = (key: "status" | "origin") => {
    const own = tokens.filter((t) => t.key === key && !t.negate);
    return own.length === 1 ? own[0]!.value : null;
  };
  const toggle = (key: "status" | "origin", word: string) => {
    const rest = tokens.filter((t) => t.key !== key);
    const next: RunToken[] =
      only(key) === word ? rest : [...rest, { key, value: word, negate: false } as RunToken];
    onChange(formatRunQuery(next));
  };
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" })}>
      <div className={facetGroup} role="group" aria-label="Status">
        {ORDER.map((word) => (
          <FacetChip
            key={word}
            label={STATUS_LABEL[word]}
            count={facets.status[word]}
            active={only("status") === word}
            onClick={() => toggle("status", word)}
          />
        ))}
      </div>
      {origins ? (
        <div className={facetGroup} role="group" aria-label="Origin">
          <FacetChip
            label="Scheduled"
            count={facets.origin.scheduled}
            active={only("origin") === "scheduled"}
            onClick={() => toggle("origin", "scheduled")}
          />
          <FacetChip
            label="Editor runs"
            count={facets.origin.editor}
            active={only("origin") === "editor"}
            onClick={() => toggle("origin", "editor")}
          />
        </div>
      ) : null}
      {value ? (
        <span className={css({ ml: "auto" })}>
          <CopyButton text={`ngn runs "${value}"`} label="Copy as ngn runs" />
        </span>
      ) : null}
    </div>
  );
}

/** A facet's values side by side, drawn like a segmented control. */
const facetGroup = css({
  display: "inline-flex",
  p: "2px",
  gap: "2px",
  rounded: "md",
  bg: "hover",
  flexShrink: 0,
});

function FacetChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={count === 0 && !active}
      className={css({
        display: "inline-flex",
        gap: "1",
        alignItems: "center",
        h: "24px",
        px: "2",
        rounded: "sm",
        border: "none",
        bg: "transparent",
        color: "muted",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "500",
        _hover: { color: "fg" },
        _disabled: { opacity: 0.45, cursor: "default", _hover: { color: "muted" } },
        "&[aria-pressed=true]": {
          bg: "raised",
          color: "fg",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        },
      })}
    >
      {label}
      <span className={css({ fontVariantNumeric: "tabular-nums", color: "faint" })}>
        {formatCount(count)}
      </span>
    </button>
  );
}
