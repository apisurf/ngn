// Per-viewer preferences and the Live switch.
//
// Everything here is a convenience: the theme, how the live editor's code and
// result panes are arranged, which sidebar panel is open and how wide. It is
// kept in localStorage and read after mount — the server renders the defaults,
// so the first paint and hydration agree — and every access is wrapped,
// because storage can be missing or blocked and the UI must work without it.

import { useRouter } from "@tanstack/react-router";
import * as React from "react";

export type ThemePref = "system" | "light" | "dark";
export type PaneLayout = "side" | "stacked";
export type SidebarPanel = "tasks" | "history" | "logs";

export interface Prefs {
  theme: ThemePref;
  layout: PaneLayout;
  sidebarWidth: number;
  sidebarOpen: boolean;
  panel: SidebarPanel;
  live: boolean;
}

const DEFAULTS: Prefs = {
  theme: "system",
  layout: "side",
  sidebarWidth: 300,
  sidebarOpen: true,
  panel: "tasks",
  live: false,
};

const STORAGE_KEY = "ngnui:prefs";

interface PrefsContextValue {
  prefs: Prefs;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  /** Bumped on every Live tick and manual refresh; data hooks outside loaders key on it. */
  refreshKey: number;
  refresh: () => void;
  lastRefresh: number | null;
}

const PrefsContext = React.createContext<PrefsContextValue | null>(null);

export function usePrefs(): PrefsContextValue {
  const value = React.useContext(PrefsContext);
  if (!value) throw new Error("usePrefs outside PrefsProvider");
  return value;
}

/** How often Live re-reads the file. A local SQLite read; this is cheap. */
const LIVE_INTERVAL_MS = 2000;

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [lastRefresh, setLastRefresh] = React.useState<number | null>(null);

  React.useEffect(() => {
    setPrefs((current) => ({ ...current, ...readStored() }));
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage unavailable: the preference lasts as long as the page.
    }
  }, [prefs, loaded]);

  React.useEffect(() => applyTheme(prefs.theme), [prefs.theme]);

  const set = React.useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((current) => ({ ...current, [key]: value }));
  }, []);

  const refresh = React.useCallback(() => {
    void router.invalidate();
    setRefreshKey((k) => k + 1);
    setLastRefresh(Date.now());
  }, [router]);

  // Live: re-read on an interval while the tab is visible.
  React.useEffect(() => {
    if (!prefs.live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, LIVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [prefs.live, refresh]);

  // Coming back to the tab is when someone wants to see what just finished.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = React.useMemo(
    () => ({ prefs, set, refreshKey, refresh, lastRefresh }),
    [prefs, set, refreshKey, refresh, lastRefresh],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

function readStored(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    if (typeof parsed !== "object" || !parsed) return {};
    // A panel this build no longer has would leave the sidebar blank.
    if (parsed.panel && !PANELS.has(parsed.panel)) delete parsed.panel;
    return parsed;
  } catch {
    return {};
  }
}

const PANELS: ReadonlySet<SidebarPanel> = new Set(["tasks", "history", "logs"]);

function applyTheme(theme: ThemePref) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const dark = theme === "dark" || (theme === "system" && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  apply();
  if (theme !== "system") return;
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}

/**
 * Runs before first paint, inlined into <head>, so a dark-mode viewer never sees
 * a white flash while React loads. Mirrors {@link applyTheme}.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"{}").theme||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;

/** A clock that ticks, for "4 min ago", starting from the server's time. */
export function useNow(initial: number, intervalMs = 15_000): number {
  const [now, setNow] = React.useState(initial);
  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
