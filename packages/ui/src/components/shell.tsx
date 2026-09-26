// The frame every page renders inside, laid out the way wireui's is:
//
//   ┌ top bar: file · Live · refresh · layout · theme ─────────────────────────┐
//   ├ rail ┬ sidebar ──────────┬ open tabs ──────────────────────────────────┤
//   │  ▣   │ Tasks             │ health.ts ×  sync-users.ts #41 ×            │
//   │  ◷   │ History           ├─────────────────────────────────────────────┤
//   │  ≡   │ Logs              │ the page                                    │
//   │ ⌂ </>⛁│                   │                                             │
//   ├──────┴───────────────────┴─────────────────────────────────────────────┤
//   └ status bar: path · size · counts · running · editor · live state ──────┘
//
// Nothing in the frame remounts on navigation, so the sidebar keeps its scroll,
// its filter and its open folders while the page beside it changes.

import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { basename, formatAgo, formatBytes, formatCount, plural } from "~/lib/format";
import type { SidebarPanel, ThemePref } from "~/lib/prefs";
import { useNow, usePrefs } from "~/lib/prefs";
import type { Tab } from "~/lib/tabs";
import { useTabs } from "~/lib/tabs";
import {
  IconClose,
  IconCode,
  IconDatabase,
  IconHistory,
  IconLogs,
  IconMonitor,
  IconMoon,
  IconOverview,
  IconRefresh,
  IconRun,
  IconSidebar,
  IconSplitSide,
  IconSplitStacked,
  IconSun,
  IconTask,
} from "./icons";
import { IconButton, mono, truncate } from "./primitives";
import { HistoryPanel } from "./sidebar-history";
import { LogsPanel } from "./sidebar-logs";
import { TasksPanel } from "./sidebar-tasks";

const root = getRouteApi("__root__");

export function Shell({ children }: { children: React.ReactNode }) {
  const { prefs } = usePrefs();
  const filterRef = React.useRef<HTMLInputElement | null>(null);
  useSlashToFilter(filterRef);

  return (
    <div className={css({ display: "flex", flexDir: "column", h: "100vh", bg: "chrome" })}>
      <TopBar />
      <div className={css({ display: "flex", flex: "1", minH: "0" })}>
        <Rail />
        {prefs.sidebarOpen ? <Sidebar filterRef={filterRef} /> : null}
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
          <TabStrip />
          <div className={css({ flex: "1", minH: "0", display: "flex", flexDir: "column" })}>
            {children}
          </div>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

/** `/` focuses the sidebar's filter, as in most tools with one. */
function useSlashToFilter(ref: React.RefObject<HTMLInputElement | null>) {
  const { prefs, set } = usePrefs();
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      event.preventDefault();
      if (!prefs.sidebarOpen) set("sidebarOpen", true);
      window.requestAnimationFrame(() => ref.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.sidebarOpen, set, ref]);
}

// -----------------------------------------------------------------------------
// Top bar
// -----------------------------------------------------------------------------

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };

function TopBar() {
  const ws = root.useLoaderData();
  const { prefs, set, refresh } = usePrefs();

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
      <span title={ws.path} className={cx(mono, truncate, css({ color: "muted", minW: "0" }))}>
        {basename(ws.path)}
      </span>

      <div className={css({ ml: "auto", display: "flex", alignItems: "center", gap: "1.5" })}>
        <button
          type="button"
          aria-pressed={prefs.live}
          onClick={() => set("live", !prefs.live)}
          title={
            prefs.live
              ? "Live: re-reading the file every 2 s"
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
              prefs.live && css({ bg: "ok", animation: "pulse 1.6s ease-in-out infinite" }),
            )}
          />
          Live
        </button>
        <IconButton label="Refresh" onClick={refresh}>
          <IconRefresh />
        </IconButton>
        <IconButton
          label={
            prefs.layout === "side"
              ? "Editor: stack code above result"
              : "Editor: code and result side by side"
          }
          onClick={() => set("layout", prefs.layout === "side" ? "stacked" : "side")}
        >
          {prefs.layout === "side" ? <IconSplitSide /> : <IconSplitStacked />}
        </IconButton>
        <IconButton
          label={`Theme: ${prefs.theme}`}
          onClick={() => set("theme", THEME_NEXT[prefs.theme])}
        >
          {prefs.theme === "system" ? (
            <IconMonitor />
          ) : prefs.theme === "light" ? (
            <IconSun />
          ) : (
            <IconMoon />
          )}
        </IconButton>
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------------
// Rail and sidebar
// -----------------------------------------------------------------------------

const PANELS: { id: SidebarPanel; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <IconTask size={18} /> },
  { id: "history", label: "History", icon: <IconHistory size={18} /> },
  { id: "logs", label: "Logs", icon: <IconLogs size={18} /> },
];

const railButton = css({
  display: "flex",
  flexDir: "column",
  alignItems: "center",
  gap: "0.5",
  w: "56px",
  py: "1.5",
  rounded: "md",
  border: "none",
  bg: "transparent",
  color: "muted",
  cursor: "pointer",
  fontSize: "10px",
  fontWeight: "500",
  textDecoration: "none",
  _hover: { color: "fg", bg: "hover" },
  "&[data-active=true]": { color: "fg", bg: "hover" },
  "&[data-active=true] svg": { color: "accent" },
});

function Rail() {
  const { prefs, set } = usePrefs();
  const select = (panel: SidebarPanel) => {
    if (prefs.panel === panel && prefs.sidebarOpen) set("sidebarOpen", false);
    else {
      set("panel", panel);
      set("sidebarOpen", true);
    }
  };

  return (
    <nav
      aria-label="Sections"
      className={css({
        display: "flex",
        flexDir: "column",
        alignItems: "center",
        gap: "1",
        w: "64px",
        pt: "1",
        pb: "2",
        flexShrink: 0,
      })}
    >
      {PANELS.map((panel) => (
        <button
          key={panel.id}
          type="button"
          className={railButton}
          data-active={prefs.sidebarOpen && prefs.panel === panel.id}
          onClick={() => select(panel.id)}
        >
          {panel.icon}
          {panel.label}
        </button>
      ))}
      <div className={css({ w: "28px", h: "1px", bg: "line", my: "1.5" })} />
      <Link
        to="/"
        className={railButton}
        activeProps={{ "data-active": true }}
        activeOptions={{ exact: true }}
      >
        <IconOverview size={18} />
        Overview
      </Link>
      <Link to="/live" className={railButton} activeProps={{ "data-active": true }}>
        <IconCode size={18} />
        Editor
      </Link>
      <Link to="/query" className={railButton} activeProps={{ "data-active": true }}>
        <IconDatabase size={18} />
        SQL
      </Link>
      <div className={css({ mt: "auto" })}>
        <IconButton
          label={prefs.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={prefs.sidebarOpen}
          onClick={() => set("sidebarOpen", !prefs.sidebarOpen)}
        >
          <IconSidebar />
        </IconButton>
      </div>
    </nav>
  );
}

const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 560;

function Sidebar({ filterRef }: { filterRef: React.RefObject<HTMLInputElement | null> }) {
  const { prefs, set } = usePrefs();
  const [dragging, setDragging] = React.useState(false);
  const [width, setWidth] = React.useState(prefs.sidebarWidth);
  React.useEffect(() => setWidth(prefs.sidebarWidth), [prefs.sidebarWidth]);
  const title = PANELS.find((p) => p.id === prefs.panel)?.label ?? "";

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
          alignItems: "center",
          h: "30px",
          px: "3",
          flexShrink: 0,
        })}
      >
        <span className={css({ fontWeight: "600", fontSize: "12px" })}>{title}</span>
      </div>
      <div className={css({ flex: "1", minH: "0" })}>
        {prefs.panel === "tasks" ? <TasksPanel filterRef={filterRef} /> : null}
        {prefs.panel === "history" ? <HistoryPanel filterRef={filterRef} /> : null}
        {prefs.panel === "logs" ? <LogsPanel filterRef={filterRef} /> : null}
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
    task: <IconTask size={13} />,
    run: <IconRun size={12} />,
    query: <IconDatabase size={13} />,
    live: <IconCode size={13} />,
  }[tab.icon];
  return (
    <span className={css({ display: "inline-flex", color: "faint", flexShrink: 0 })}>{glyph}</span>
  );
}

// -----------------------------------------------------------------------------
// Status bar
// -----------------------------------------------------------------------------

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
      <span className={cx(item, mono, truncate, css({ minW: "0", flexShrink: 1 }))} title={ws.path}>
        <IconDatabase size={12} />
        {ws.path}
      </span>
      <span className={item}>{formatBytes(ws.bytes)}</span>
      {c ? (
        <span className={item}>
          {plural(c.tasks, "task")} · {plural(c.runs, "run")}
        </span>
      ) : null}
      {c?.open ? (
        <span className={cx(item, css({ color: "info" }))}>{formatCount(c.open)} running</span>
      ) : null}
      <span className={item} title={ws.live ?? "Start ngnui with --live to enable the editor"}>
        <IconCode size={12} />
        {ws.live ? `editor → ${ws.live.replace(/^https?:\/\//, "")}` : "editor off"}
      </span>
      <span className={cx(item, css({ ml: "auto" }))}>
        {prefs.live ? <span className={css({ color: "ok" })}>● Live</span> : <span>Read-only</span>}
        {lastRefresh ? (
          <span className={css({ color: "faint" })}>· read {formatAgo(now, lastRefresh)}</span>
        ) : null}
      </span>
    </footer>
  );
}
