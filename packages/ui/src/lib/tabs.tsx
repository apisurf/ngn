// Open tabs, the way an API client keeps them.
//
// Every page is a tab: a run, a task, the overview, the SQL console, the live
// editor. The URL stays the source of truth for what is on screen; this only
// remembers what else is open and where each tab last was, so switching back
// lands on the same sub-tab it was left on.
//
// Opening something from a single click reuses the one *preview* tab (drawn in
// italics) instead of piling up a tab per click, which is how walking a task's
// runs one by one stays tidy. Double-click a tab, or a sidebar row, to keep it.

import { useLocation, useNavigate } from "@tanstack/react-router";
import * as React from "react";

export type TabIcon = "overview" | "task" | "run" | "query" | "live";

export interface Tab {
  /** Identity: `run:7`, `task:3`, `overview`, `query`, `live`. */
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
  query: () => "query",
  live: () => "live",
  run: (id: number) => `run:${id}`,
  task: (id: number) => `task:${id}`,
};

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
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const href = location.href;

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

  // Keep the active tab's href in step with sub-tab and filter changes.
  React.useEffect(() => {
    if (!activeKey) return;
    setTabs((current) =>
      current.map((t) => (t.key === activeKey && t.href !== href ? { ...t, href } : t)),
    );
  }, [href, activeKey]);

  const register = React.useCallback(
    (tab: Omit<Tab, "preview" | "href">) => {
      setActiveKey(tab.key);
      setTabs((current) => {
        const existing = current.findIndex((t) => t.key === tab.key);
        if (existing >= 0) {
          const next = [...current];
          next[existing] = { ...next[existing]!, ...tab, href };
          return next;
        }
        const fresh: Tab = { ...tab, href, preview: true };
        const preview = current.findIndex((t) => t.preview);
        if (preview >= 0) {
          const next = [...current];
          next[preview] = fresh;
          return next;
        }
        return [...current, fresh];
      });
    },
    [href],
  );

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
        if (!neighbour) setActiveKey(null);
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

/** Stored tabs first, then any the current page registered before they loaded. */
function merge(stored: Tab[], current: Tab[]): Tab[] {
  const valid = Array.isArray(stored)
    ? stored.filter((t) => t && typeof t.key === "string" && typeof t.href === "string")
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
