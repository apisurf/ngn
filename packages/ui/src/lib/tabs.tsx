// Open tabs, the way an API client keeps them.
//
// Every page is a tab: a run, a task, the overview, the run history, the log
// feed, the SQL console, the live editor. The URL stays the source of truth for what is on screen; this only
// remembers what else is open and where each tab last was, so switching back
// lands on the same sub-tab it was left on.
//
// Opening something from a single click reuses the one *preview* tab (drawn in
// italics) instead of piling up a tab per click, which is how walking a task's
// runs one by one stays tidy. Double-click a tab, or a sidebar row, to keep it.

import { useLocation, useNavigate } from "@tanstack/react-router";
import * as React from "react";

export type TabIcon = "overview" | "history" | "logs" | "task" | "run" | "query" | "live";

export interface Tab {
  /** Identity: `run:7`, `task:3`, `overview`, `history`, `logs`, `query`, `live`. */
  key: string;
  /** Where the tab was last, sub-tabs and all. */
  href: string;
  title: string;
  icon: TabIcon;
  /** Painted red: a failed run, or a task whose latest run failed. */
  failed?: boolean;
  preview: boolean;
}

export const tabKey = {
  overview: () => "overview",
  history: () => "history",
  logs: () => "logs",
  query: () => "query",
  live: () => "live",
  run: (id: number) => `run:${id}`,
  task: (id: number) => `task:${id}`,
};

/**
 * The tab a URL belongs to, read off the path alone. Which tab owns the URL on
 * screen is decided here rather than by which page registered last: during a
 * navigation the URL changes before the page leaving it unmounts, and asking
 * that page would file the new URL under the old tab.
 */
export function tabKeyFor(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return tabKey.overview();
  const run = /^\/tasks\/\d+\/runs\/(\d+)$/.exec(path);
  if (run) return tabKey.run(Number(run[1]));
  const task = /^\/tasks\/(\d+)$/.exec(path);
  if (task) return tabKey.task(Number(task[1]));
  const page = path.slice(1);
  if (page === "history" || page === "logs" || page === "query" || page === "live") return page;
  return null;
}

interface TabsContextValue {
  tabs: Tab[];
  activeKey: string | null;
  /** Called by a page for itself, every render that changes what it shows. */
  register: (tab: Omit<Tab, "preview" | "href">) => void;
  pin: (key: string) => void;
  close: (key: string) => void;
  closeOthers: (key: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function useTabs(): TabsContextValue {
  const value = React.useContext(TabsContext);
  if (!value) throw new Error("useTabs outside TabsProvider");
  return value;
}

const STORAGE_KEY = "ngnui:tabs";

/** A page's own tab. Call once at the top of a route component. */
export function useTab(tab: Omit<Tab, "preview" | "href">) {
  const { register } = useTabs();
  const { key, title, icon, failed } = tab;
  React.useEffect(() => {
    register({ key, title, icon, failed });
  }, [register, key, title, icon, failed]);
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = React.useState<Tab[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const href = location.href;
  const activeKey = tabKeyFor(location.pathname);
  // Read, not depended on: a page re-registering because the URL moved on would
  // otherwise take the URL of wherever it is being navigated to.
  const onScreen = React.useRef({ href, key: activeKey });
  onScreen.current = { href, key: activeKey };

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setTabs((current) => merge(JSON.parse(raw) as Tab[], current));
    } catch {
      // Nothing stored, or storage blocked: start with what is on screen.
    }
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // The tab strip lasts as long as the page.
    }
  }, [tabs, loaded]);

  // Keep the tab the URL belongs to in step with sub-tab and filter changes.
  React.useEffect(() => {
    if (!activeKey) return;
    setTabs((current) =>
      current.map((t) => (t.key === activeKey && t.href !== href ? { ...t, href } : t)),
    );
  }, [href, activeKey]);

  const register = React.useCallback((tab: Omit<Tab, "preview" | "href">) => {
    // A page still on screen while the next one loads has no say.
    if (tab.key !== onScreen.current.key) return;
    const at = onScreen.current.href;
    setTabs((current) => {
      const existing = current.findIndex((t) => t.key === tab.key);
      if (existing >= 0) {
        const next = [...current];
        next[existing] = { ...next[existing]!, ...tab };
        return next;
      }
      const fresh: Tab = { ...tab, href: at, preview: true };
      const preview = current.findIndex((t) => t.preview);
      if (preview >= 0) {
        const next = [...current];
        next[preview] = fresh;
        return next;
      }
      return [...current, fresh];
    });
  }, []);

  const pin = React.useCallback((key: string) => {
    setTabs((current) => current.map((t) => (t.key === key ? { ...t, preview: false } : t)));
  }, []);

  const close = React.useCallback(
    (key: string) => {
      const index = tabs.findIndex((t) => t.key === key);
      if (index < 0) return;
      const next = tabs.filter((t) => t.key !== key);
      setTabs(next);
      if (key === activeKey) {
        const neighbour = next[Math.min(index, next.length - 1)];
        void navigate({ href: neighbour?.href ?? "/" });
      }
    },
    [tabs, activeKey, navigate],
  );

  const closeOthers = React.useCallback((key: string) => {
    setTabs((current) => current.filter((t) => t.key === key));
  }, []);

  const value = React.useMemo(
    () => ({ tabs, activeKey, register, pin, close, closeOthers }),
    [tabs, activeKey, register, pin, close, closeOthers],
  );
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

/**
 * A stored tab whose href points at another tab's page — which older builds
 * could save — is sent back to its own page, or dropped when that is unknown.
 */
function repair(tab: Tab): Tab | null {
  if (tabKeyFor(tab.href.split(/[?#]/)[0]!) === tab.key) return tab;
  const home = homeOf(tab.key);
  return home ? { ...tab, href: home } : null;
}

/** Where a tab's page lives, from its key alone. */
function homeOf(key: string): string | null {
  const [kind, id] = key.split(":");
  if (kind === "overview") return "/";
  if (kind === "task" && id) return `/tasks/${id}`;
  // The run's task is not in its key; the bare run URL redirects to it.
  if (kind === "run" && id) return `/runs/${id}`;
  if (kind === "history" || kind === "logs" || kind === "query" || kind === "live")
    return `/${kind}`;
  return null;
}

/** Stored tabs first, then any the current page registered before they loaded. */
function merge(stored: Tab[], current: Tab[]): Tab[] {
  const valid = Array.isArray(stored)
    ? stored
        .filter((t) => t && typeof t.key === "string" && typeof t.href === "string")
        .map(repair)
        .filter((t): t is Tab => t != null)
    : [];
  const keys = new Set(valid.map((t) => t.key));
  const extra = current.filter((t) => !keys.has(t.key));
  // At most one preview tab survives a merge: the last one.
  const merged = [...valid, ...extra];
  const keep = merged.findLastIndex((t) => t.preview);
  for (const [i, t] of merged.entries()) {
    if (t.preview && i !== keep) merged[i] = Object.assign({}, t, { preview: false });
  }
  return merged;
}
