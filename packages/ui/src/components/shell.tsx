// The frame every page renders inside:
//
//   ┌ top bar: ngnui / file · Follow · Refresh · Settings ─────────────────────┐
//   ├ sidebar ────────────────┬ the page ───────────────────────────────────────┤
//   │ Overview                │ Tasks / extract.ts / Run #2                    │
//   │ Runs                    │                                                │
//   │ Editor                  │                                                │
//   │ Tasks      [filter]     │                                                │
//   │  tasks/api/             │                                                │
//   │   sync-users.ts      ●  │                                                │
//   ├─────────────────────────┴────────────────────────────────────────────────┤
//   └ status bar: runtime · running · stalled · Follow state ─────────────────┘
//
// One navigation column: the global pages on top, the project's tasks below.
// Collapsed, it leaves a strip with the pages' icons and a way back. The tab
// strip is opt-in (Settings); every view has its own URL either way. Nothing in
// the frame remounts on navigation, so it keeps its scroll and its filter.

import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { basename, formatAgo, formatCount } from "~/lib/format";
import { useNow, usePrefs } from "~/lib/prefs";
import type { Tab } from "~/lib/tabs";
import { useTabs } from "~/lib/tabs";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCode,
  IconHistory,
  IconOverview,
  IconRefresh,
  IconRun,
  IconTask,
} from "./icons";
import { IconButton, mono, truncate } from "./primitives";
import { CommandPalette } from "./command-palette";
import { SettingsMenu } from "./settings-menu";
import { TasksPanel } from "./sidebar-tasks";

const root = getRouteApi("__root__");

export function Shell({ children }: { children: React.ReactNode }) {
  const { prefs } = usePrefs();
  useSlashToFilter();

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "100vh", bg: "chrome" })}>
      <TopBar />
      <div className={css({ display: "flex", flex: "1", minH: "0" })}>
        {prefs.sidebarOpen ? <Sidebar /> : <CollapsedSidebar />}
        <main
          className={css({
            display: "flex",
            flexDir: "column",
            flex: "1",
            minW: "0",
            bg: "canvas",
            borderLeft: "1px solid",
            borderTop: "1px solid",
            borderColor: "line",
            roundedTopLeft: "lg",
            overflow: "hidden",
          })}
        >
          {prefs.tabs ? <TabStrip /> : null}
          <div className={css({ flex: "1", minH: "0", display: "flex", flexDir: "column" })}>
            {children}
          </div>
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  );
}

/**
 * `/` focuses the page's own filter (Runs has one), as in most tools with one,
 * and nothing else: getting to a task is ⌘K's job.
 */
function useSlashToFilter() {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      event.preventDefault();
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

function TopBar() {
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

      <div className={css({ ml: "auto", display: "flex", alignItems: "center", gap: "1.5" })}>
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
// Rail and sidebar
// -----------------------------------------------------------------------------

const navItem = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  h: "28px",
  px: "2",
  rounded: "sm",
  color: "fg",
  textDecoration: "none",
  fontSize: "13px",
  fontWeight: "500",
  _hover: { bg: "hover" },
  "& svg": { color: "muted" },
  "&[data-active=true]": { bg: "selected" },
  "&[data-active=true] svg": { color: "accent" },
});

/** The global pages, in the order the sidebar lists them. */
const PAGES = [
  {
    to: "/",
    label: "Overview",
    hint: "Is anything wrong, and every task's health",
    icon: IconOverview,
    exact: true,
  },
  {
    to: "/runs",
    label: "Runs",
    hint: "Every run of every task, filtered",
    icon: IconHistory,
    exact: false,
  },
  {
    to: "/live",
    label: "Editor",
    hint: "Run code once in this project's ngn run, with its config and env",
    icon: IconCode,
    exact: false,
  },
] as const;

function PageLinks() {
  return (
    <nav
      aria-label="Pages"
      className={css({ display: "flex", flexDir: "column", gap: "0.5", px: "1.5" })}
    >
      {PAGES.map(({ to, label, hint, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          title={hint}
          className={navItem}
          activeProps={{ "data-active": true }}
          activeOptions={{ exact, includeSearch: false }}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 560;

function Sidebar() {
  const { prefs, set } = usePrefs();
  const [dragging, setDragging] = React.useState(false);
  const [width, setWidth] = React.useState(prefs.sidebarWidth);
  React.useEffect(() => setWidth(prefs.sidebarWidth), [prefs.sidebarWidth]);

  return (
    <aside
      className={css({
        position: "relative",
        display: "flex",
        flexDir: "column",
        flexShrink: 0,
        minH: "0",
        pt: "1",
      })}
      style={{ width }}
    >
      <div
        className={css({
          display: "flex",
          justifyContent: "flex-end",
          pr: "1.5",
          flexShrink: 0,
        })}
      >
        <IconButton label="Collapse the sidebar" onClick={() => set("sidebarOpen", false)}>
          <IconChevronLeft size={14} />
        </IconButton>
      </div>
      <PageLinks />
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          h: "30px",
          mt: "3",
          pl: "3",
          pr: "1.5",
          flexShrink: 0,
        })}
      >
        <span className={css({ fontWeight: "600", fontSize: "12px" })}>Tasks</span>
      </div>
      <div className={css({ flex: "1", minH: "0" })}>
        <TasksPanel />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const aside = (e.target as HTMLElement).parentElement;
          if (!aside) return;
          const left = aside.getBoundingClientRect().left;
          setWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, e.clientX - left)));
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          set("sidebarWidth", width);
        }}
        className={cx(
          css({
            position: "absolute",
            top: "0",
            bottom: "0",
            right: "-3px",
            w: "6px",
            cursor: "col-resize",
            zIndex: "2",
            _hover: { bg: "accent", opacity: 0.4 },
          }),
          dragging && css({ bg: "accent", opacity: 0.4 }),
        )}
      />
    </aside>
  );
}

/**
 * What the sidebar leaves when collapsed: the pages as icons, so they stay a
 * click away, and a button to bring the sidebar back.
 */
function CollapsedSidebar() {
  const { set } = usePrefs();
  return (
    <div
      className={css({
        display: "flex",
        flexDir: "column",
        alignItems: "center",
        gap: "1",
        w: "40px",
        pt: "1",
        flexShrink: 0,
      })}
    >
      <IconButton label="Expand the sidebar" onClick={() => set("sidebarOpen", true)}>
        <IconChevronRight size={14} />
      </IconButton>
      <nav aria-label="Pages" className={css({ display: "flex", flexDir: "column", gap: "1" })}>
        {PAGES.map(({ to, label, hint, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            title={`${label}: ${hint}`}
            className={cx(navItem, css({ w: "28px", px: "0", justifyContent: "center" }))}
            activeProps={{ "data-active": true }}
            activeOptions={{ exact, includeSearch: false }}
          >
            <Icon size={15} />
          </Link>
        ))}
      </nav>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------

function TabStrip() {
  const { tabs, activeKey, pin, close } = useTabs();
  const navigate = useNavigate();

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className={css({
        display: "flex",
        alignItems: "stretch",
        h: "36px",
        flexShrink: 0,
        bg: "chrome",
        borderBottom: "1px solid",
        borderColor: "line",
        overflowX: "auto",
        scrollbarWidth: "none",
      })}
    >
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tab"
          tabIndex={0}
          aria-selected={tab.key === activeKey}
          data-preview={tab.preview}
          title={tab.preview ? `${tab.title} — preview; double-click to keep open` : tab.title}
          onClick={() => void navigate({ href: tab.href })}
          onKeyDown={(e) => {
            if (e.key === "Enter") void navigate({ href: tab.href });
          }}
          onDoubleClick={() => pin(tab.key)}
          onAuxClick={(e) => {
            if (e.button === 1) close(tab.key);
          }}
          className={css({
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "1.5",
            pl: "3",
            pr: "1",
            minW: "0",
            maxW: "220px",
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "line",
            cursor: "pointer",
            color: "muted",
            userSelect: "none",
            _hover: { color: "fg", bg: "hover" },
            "&[aria-selected=true]": {
              bg: "canvas",
              color: "fg",
              _before: {
                content: '""',
                position: "absolute",
                left: "0",
                right: "0",
                top: "0",
                h: "2px",
                bg: "accent",
              },
            },
            "&[data-preview=true] .tab-title": { fontStyle: "italic" },
            "& .tab-close": { opacity: 0 },
            "&:hover .tab-close, &[aria-selected=true] .tab-close": { opacity: 1 },
          })}
        >
          <TabGlyph tab={tab} />
          <span
            className={cx(
              "tab-title",
              truncate,
              css({ fontSize: "12px" }),
              tab.failed ? css({ color: "bad" }) : undefined,
            )}
          >
            {tab.title}
          </span>
          <IconButton
            label="Close tab"
            className={cx("tab-close", css({ w: "20px", h: "20px" }))}
            onClick={(e) => {
              e.stopPropagation();
              close(tab.key);
            }}
          >
            <IconClose size={12} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function TabGlyph({ tab }: { tab: Tab }) {
  const glyph = {
    overview: <IconOverview size={13} />,
    runs: <IconHistory size={13} />,
    task: <IconTask size={13} />,
    run: <IconRun size={12} />,
    live: <IconCode size={13} />,
  }[tab.icon];
  return (
    <span className={css({ display: "inline-flex", color: "faint", flexShrink: 0 })}>{glyph}</span>
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
