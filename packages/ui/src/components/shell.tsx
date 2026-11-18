// The frame every page renders inside: the canvas, with the open page over it.
//
//   ┌ top bar: ngnui / file · Go to… ⌘K · Overview · Runs · Editor · Follow ⟳ ⚙ ┐
//   ├ crumbs: Canvas › sync-users.ts › #41 ───────────────────────────────────── ┤
//   │ canvas: tasks and their runs, pan and zoom, or the open page laid flat   │
//   │ over it                                                                  │
//   ├──────────────────────────────────────────────────────────────────────────┤
//   └ status bar: runtime · running · stalled · Follow state ──────────────────┘
//
// The canvas is the home page. Opening anything (a node, a link, ⌘K) drops its
// page as a flat layer over the canvas, one layer per crumb. Nothing in the
// frame remounts on navigation, so the canvas keeps its viewport under
// whatever is open.

import { getRouteApi, Link } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { Canvas } from "~/canvas/canvas";
import { CrumbBar, Layers, useDepth } from "~/canvas/layers";
import { basename, formatAgo, formatCount } from "~/lib/format";
import { useNow, usePrefs } from "~/lib/prefs";
import { CommandPalette, useCommandPalette } from "./command-palette";
import { IconCode, IconHistory, IconOverview, IconRefresh, IconSearch } from "./icons";
import { IconButton, Kbd, mono, truncate } from "./primitives";
import { SettingsMenu } from "./settings-menu";
import { useUnreadable } from "./states";

const root = getRouteApi("__root__");

export function Shell({ children }: { children: React.ReactNode }) {
  useSlashToFilter();
  const [palette, setPalette] = useCommandPalette();
  const onCanvas = useDepth() === 0;
  const unreadable = useUnreadable();
  const { refresh } = usePrefs();

  // Back on the canvas, re-read the file, so it shows the runs that landed
  // while a page was open over it.
  const wasCovered = React.useRef(false);
  React.useEffect(() => {
    if (onCanvas && wasCovered.current) refresh();
    wasCovered.current = !onCanvas;
  }, [onCanvas, refresh]);

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "100vh", bg: "chrome" })}>
      <TopBar onGoTo={() => setPalette(true)} />
      {palette ? <CommandPalette close={() => setPalette(false)} /> : null}
      <CrumbBar />
      <main
        className={css({
          position: "relative",
          flex: "1",
          minH: "0",
          overflow: "hidden",
          borderTop: "1px solid {colors.line}",
        })}
      >
        <Canvas covered={!onCanvas} />
        {unreadable && onCanvas ? (
          // Says why the canvas has no tasks or runs on it.
          <div
            className={css({
              position: "absolute",
              top: "4",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 4,
              w: "min(560px, calc(100% - 32px))",
              bg: "raised",
              border: "1px solid {colors.line}",
              rounded: "lg",
              boxShadow: "masthead",
            })}
          >
            {unreadable}
          </div>
        ) : null}
        <Layers>{children}</Layers>
      </main>
      <StatusBar />
    </div>
  );
}

/** `/` focuses the open page's own filter, when it has one (Runs has one). */
function useSlashToFilter() {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      const own = document.querySelector<HTMLInputElement>("main input[data-page-filter]");
      if (!own) return;
      event.preventDefault();
      own.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// -----------------------------------------------------------------------------
// Top bar
// -----------------------------------------------------------------------------

/** The pages that sit straight over the canvas, in the order the top bar lists them. */
const PAGES = [
  {
    to: "/overview",
    label: "Overview",
    hint: "Is anything wrong, and every task's health",
    icon: IconOverview,
  },
  { to: "/runs", label: "Runs", hint: "Every run of every task, filtered", icon: IconHistory },
  {
    to: "/live",
    label: "Editor",
    hint: "Run code once in this project's ngn run, with its config and env",
    icon: IconCode,
  },
] as const;

const pageLink = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  h: "28px",
  px: "2.5",
  rounded: "md",
  color: "muted",
  fontSize: "12px",
  fontWeight: "500",
  textDecoration: "none",
  _hover: { color: "fg", bg: "hover" },
  "&.active": { color: "accent", bg: "accentSoft" },
});

function TopBar({ onGoTo }: { onGoTo: () => void }) {
  const ws = root.useLoaderData();
  const { prefs, set, refresh } = usePrefs();
  const [settings, setSettings] = React.useState(false);

  return (
    <header
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "3",
        h: "44px",
        px: "3",
        flexShrink: 0,
      })}
    >
      <Link
        to="/"
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          color: "fg",
          textDecoration: "none",
        })}
      >
        <img src="/favicon.svg" alt="" width={22} height={22} />
        <span className={css({ fontWeight: "700", letterSpacing: "-0.01em", fontSize: "14px" })}>
          ngn<span className={css({ color: "muted", fontWeight: "500" })}>ui</span>
        </span>
      </Link>
      <span className={css({ color: "lineStrong" })}>/</span>
      {/* The database's name; its full path and size are in Settings. */}
      <button
        type="button"
        title={`${ws.path} — open Settings`}
        aria-label={`Database ${basename(ws.path)}: open Settings`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setSettings((was) => !was)}
        className={cx(
          mono,
          truncate,
          css({
            minW: "0",
            border: "none",
            bg: "transparent",
            p: "0",
            color: "muted",
            cursor: "pointer",
            fontSize: "inherit",
            _hover: { color: "fg", textDecoration: "underline" },
          }),
        )}
      >
        {basename(ws.path)}
      </button>

      <button
        type="button"
        onClick={onGoTo}
        title="Go to a task, a run or a page (⌘K)"
        className={css({
          display: "inline-flex",
          alignItems: "center",
          gap: "2",
          h: "28px",
          w: "min(320px, 30vw)",
          px: "2.5",
          mx: "auto",
          rounded: "md",
          border: "1px solid",
          borderColor: "line",
          bg: "raised",
          color: "faint",
          cursor: "pointer",
          fontSize: "12px",
          _hover: { color: "muted", borderColor: "lineStrong" },
        })}
      >
        <IconSearch size={13} />
        <span>Go to…</span>
        <span className={css({ ml: "auto" })}>
          <Kbd>⌘K</Kbd>
        </span>
      </button>

      <div className={css({ display: "flex", alignItems: "center", gap: "1.5" })}>
        {PAGES.map(({ to, label, hint, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            title={hint}
            className={pageLink}
            activeOptions={{ exact: true, includeSearch: false }}
          >
            <Icon size={13} />
            {label}
          </Link>
        ))}
        <span className={css({ w: "1px", h: "18px", bg: "line", mx: "1" })} />
        <button
          type="button"
          aria-pressed={prefs.follow}
          onClick={() => set("follow", !prefs.follow)}
          title={
            prefs.follow
              ? "Following: re-reading the file every 2 s"
              : "Follow the file as runs write to it"
          }
          className={css({
            display: "inline-flex",
            alignItems: "center",
            gap: "1.5",
            h: "28px",
            px: "2.5",
            rounded: "md",
            border: "1px solid",
            borderColor: "line",
            bg: "raised",
            color: "muted",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "500",
            _hover: { color: "fg" },
            "&[aria-pressed=true]": { color: "ok", borderColor: "ok", bg: "okSoft" },
          })}
        >
          <span
            className={cx(
              css({ w: "7px", h: "7px", rounded: "full", bg: "faint" }),
              prefs.follow && css({ bg: "ok", animation: "pulse 1.6s ease-in-out infinite" }),
            )}
          />
          Follow
        </button>
        <IconButton label="Refresh" onClick={refresh}>
          <IconRefresh />
        </IconButton>
        <SettingsMenu open={settings} setOpen={setSettings} />
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------------
// Status bar
// -----------------------------------------------------------------------------

const statusLink = css({ textDecoration: "none", _hover: { textDecoration: "underline" } });

/**
 * What the system is doing, and nothing else: the live runtime, runs that are
 * going or stalled (each a link to them), and whether the page is following the
 * file. Where the file is lives in the settings menu.
 */
function StatusBar() {
  const ws = root.useLoaderData();
  const { prefs, lastRefresh } = usePrefs();
  const now = useNow(ws.now, 1000);
  const c = ws.counts;
  const item = css({
    display: "inline-flex",
    alignItems: "center",
    gap: "1",
    whiteSpace: "nowrap",
  });

  return (
    <footer
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "4",
        h: "24px",
        px: "3",
        flexShrink: 0,
        fontSize: "11px",
        color: "muted",
        borderTop: "1px solid",
        borderColor: "line",
        overflow: "hidden",
      })}
    >
      <span className={item} title={ws.live ?? "No live runtime: the editor is off"}>
        <IconCode size={12} />
        {ws.live ? `runtime ${ws.live.replace(/^https?:\/\//, "")}` : "runtime off"}
      </span>
      {c?.open ? (
        <Link
          to="/runs"
          search={{ q: "status:running" }}
          className={cx(item, statusLink, css({ color: "info" }))}
        >
          {formatCount(c.open)} running
        </Link>
      ) : null}
      {c?.stalled ? (
        <Link
          to="/runs"
          search={{ q: "status:stalled" }}
          className={cx(item, statusLink, css({ color: "warn" }))}
          title="No end recorded, long past when they should have finished"
        >
          {formatCount(c.stalled)} stalled
        </Link>
      ) : null}
      <span className={cx(item, css({ ml: "auto" }))}>
        {prefs.follow ? (
          <span className={css({ color: "ok" })}>● Following</span>
        ) : (
          <span>Read-only</span>
        )}
        {lastRefresh ? (
          <span className={css({ color: "faint" })}>· read {formatAgo(now, lastRefresh)}</span>
        ) : null}
      </span>
    </footer>
  );
}
