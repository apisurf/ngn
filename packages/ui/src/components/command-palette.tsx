// ⌘K (Ctrl-K elsewhere): get anywhere from the keyboard. Typing narrows the
// project's tasks by path and the pages by name; a number offers that run; and
// a few actions — Follow, refresh, theme — sit alongside.

import { getRouteApi, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { usePrefs } from "~/lib/prefs";
import { getRunTaskId } from "~/server/api";
import {
  IconClock,
  IconCode,
  IconHistory,
  IconMonitor,
  IconMoon,
  IconOverview,
  IconRefresh,
  IconRun,
  IconSun,
  IconTask,
} from "./icons";
import { Kbd, mono, truncate } from "./primitives";

const root = getRouteApi("__root__");

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Most items listed at once; the rest are a few more letters away. */
const MAX_ITEMS = 12;

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return open ? <Palette close={() => setOpen(false)} /> : null;
}

function Palette({ close }: { close: () => void }) {
  const ws = root.useLoaderData();
  const navigate = useNavigate();
  const { prefs, set, refresh } = usePrefs();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [runTask, setRunTask] = React.useState<{ runId: number; taskId: number } | null>(null);
  const listId = React.useId();

  // A number is a run, when the file has it.
  const wanted = /^#?(\d+)$/.exec(query.trim())?.[1];
  React.useEffect(() => {
    setRunTask(null);
    if (!wanted) return;
    let cancelled = false;
    void getRunTaskId({ data: { runId: wanted } }).then((taskId) => {
      if (!cancelled && taskId != null) setRunTask({ runId: Number(wanted), taskId });
    });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const items = React.useMemo<Item[]>(() => {
    const all: Item[] = [
      ...(runTask
        ? [
            {
              id: `run:${runTask.runId}`,
              label: `Run #${runTask.runId}`,
              hint: ws.tasks.find((t) => t.id === runTask.taskId)?.path,
              icon: <IconRun size={12} />,
              run: () =>
                void navigate({
                  to: "/tasks/$taskId/runs/$runId",
                  params: { taskId: String(runTask.taskId), runId: String(runTask.runId) },
                }),
            },
          ]
        : []),
      ...ws.tasks
        .filter((task) => !task.editor)
        .map((task) => ({
          id: `task:${task.id}`,
          label: task.file,
          hint: task.dir,
          icon: <IconTask size={14} />,
          run: () => void navigate({ to: "/tasks/$taskId", params: { taskId: String(task.id) } }),
        })),
      {
        id: "page:overview",
        label: "Overview",
        icon: <IconOverview size={14} />,
        run: () => void navigate({ to: "/" }),
      },
      {
        id: "page:runs",
        label: "Runs",
        icon: <IconHistory size={14} />,
        run: () => void navigate({ to: "/runs" }),
      },
      ...(["failed", "stalled", "running"] as const).map((status) => ({
        id: `page:runs:${status}`,
        label: `Runs: ${status}`,
        icon: <IconHistory size={14} />,
        run: () => void navigate({ to: "/runs", search: { q: `status:${status}` } }),
      })),
      {
        id: "page:editor",
        label: "Editor",
        icon: <IconCode size={14} />,
        run: () => void navigate({ to: "/live" }),
      },
      {
        id: "action:follow",
        label: prefs.follow ? "Stop following the file" : "Follow the file",
        hint: "re-read every 2 s",
        icon: <IconClock size={14} />,
        run: () => set("follow", !prefs.follow),
      },
      { id: "action:refresh", label: "Refresh", icon: <IconRefresh size={14} />, run: refresh },
      ...(["system", "light", "dark"] as const).map((theme) => ({
        id: `action:theme:${theme}`,
        label: `Theme: ${theme}`,
        hint: prefs.theme === theme ? "current" : undefined,
        icon: {
          system: <IconMonitor size={14} />,
          light: <IconSun size={14} />,
          dark: <IconMoon size={14} />,
        }[theme],
        run: () => set("theme", theme),
      })),
    ];
    // A number is a run: offer that run, not whatever else has the digits in it.
    if (wanted) return all.filter((item) => item.id.startsWith("run:"));
    const needle = query.trim().toLowerCase();
    if (!needle)
      return all.filter((item) => !item.id.startsWith("action:theme")).slice(0, MAX_ITEMS);
    return all
      .filter((item) => `${item.hint ?? ""}${item.label}`.toLowerCase().includes(needle))
      .slice(0, MAX_ITEMS);
  }, [ws.tasks, runTask, query, wanted, prefs.follow, prefs.theme, navigate, set, refresh]);

  React.useEffect(() => setActive(0), [query]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  return (
    <div
      className={css({
        position: "fixed",
        inset: "0",
        zIndex: "50",
        bg: "rgba(0, 0, 0, 0.25)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        pt: "15vh",
      })}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        className={css({
          w: "560px",
          maxW: "calc(100vw - 32px)",
          bg: "raised",
          border: "1px solid",
          borderColor: "line",
          rounded: "lg",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
        })}
      >
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opening the palette is asking to type
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          aria-label="Go to a task, a run or a page"
          placeholder="Go to a task, a run number or a page…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(items[active]);
            }
          }}
          className={css({
            w: "full",
            h: "44px",
            px: "4",
            border: "none",
            borderBottom: "1px solid",
            borderColor: "line",
            outline: "none",
            bg: "transparent",
            color: "fg",
            fontSize: "14px",
          })}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Results"
          className={css({ listStyle: "none", m: "0", p: "1.5", maxH: "50vh", overflow: "auto" })}
        >
          {items.length === 0 ? (
            <li className={css({ px: "3", py: "2", color: "muted", fontSize: "13px" })}>
              {wanted ? `No run #${wanted} in this file.` : "Nothing matches."}
            </li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "2",
                  px: "3",
                  h: "32px",
                  rounded: "md",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "fg",
                  "&[aria-selected=true]": { bg: "selected" },
                })}
              >
                <span className={css({ color: "muted", display: "inline-flex" })}>{item.icon}</span>
                <span className={css({ fontWeight: "500", flexShrink: 0 })}>{item.label}</span>
                {item.hint ? (
                  <span className={cx(truncate, mono, css({ color: "faint", fontSize: "12px" }))}>
                    {item.hint}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
        <div
          className={css({
            display: "flex",
            gap: "3",
            px: "3",
            py: "2",
            borderTop: "1px solid",
            borderColor: "line",
            color: "muted",
            fontSize: "11px",
            flexWrap: "wrap",
          })}
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> choose · <Kbd>↵</Kbd> go · <Kbd>esc</Kbd> close
          </span>
          <span>
            <Kbd>/</Kbd> page filter · <Kbd>[</Kbd> <Kbd>]</Kbd> previous, next run
          </span>
        </div>
      </div>
    </div>
  );
}
