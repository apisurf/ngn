// The layers: the page for whatever is open, laid flat over the canvas, one
// layer per step down the crumbs.
//
//   Canvas › sync-users.ts › #41                   ← the crumbs, always on top
//   ┌─────────────────────────────────────────┐
//   │ Run #41, the open page                  │    ← covers the canvas and
//   │                                         │      every layer under it
//
// The canvas is the bottom layer. Opening a task flies its page in over the
// canvas; opening one of its runs flies the run's page in over the task's.
// Going back up, the open page flies out and the one under it is there again.
// Every layer is flat and fills the same space, so only the open one is drawn:
// the ones under it are its crumbs. Clicking a crumb goes back up to it; Esc
// goes up one.

import { useNavigate, useRouterState } from "@tanstack/react-router";
import * as React from "react";
import { css, cx } from "styled-system/css";
import { IconChevronRight, IconClose, IconCode, IconTask } from "~/components/icons";
import { Dot, IconButton, mono, truncate } from "~/components/primitives";
import { runMark } from "~/lib/ngn";

// -----------------------------------------------------------------------------
// Crumbs: where the open page sits, one per layer
// -----------------------------------------------------------------------------

interface Loaded {
  run?: { id: number; task_id: number; status: string; stalled: boolean; editor: boolean };
  task?: { id: number; path: string; file: string; editor: boolean };
}

export interface Crumb {
  /** Where it goes. */
  href: string;
  /** What it says, for the layer's label. */
  title: string;
  label: React.ReactNode;
}

/** Pages that are a layer of their own, straight over the canvas. */
const PAGES: Record<string, string> = {
  "/overview": "Overview",
  "/runs": "Runs",
  "/live": "Editor",
};

/** Canvas first, then one crumb per layer, the open page last. */
export function useCrumbs(): Crumb[] {
  const { loaded, path, href } = useRouterState({
    select: (s) => {
      const merged: Loaded = {};
      for (const match of s.matches) {
        const data = match.loaderData as Loaded | undefined;
        if (data && typeof data === "object") Object.assign(merged, data);
      }
      return {
        loaded: { run: merged.run, task: Array.isArray(merged.task) ? undefined : merged.task },
        path: s.location.pathname.replace(/\/+$/, "") || "/",
        href: s.location.href,
      };
    },
    structuralSharing: true,
  });

  return React.useMemo(() => {
    const crumbs: Crumb[] = [{ href: "/", title: "Canvas", label: "Canvas" }];
    if (path === "/") return crumbs;
    const page = PAGES[path];
    if (page) return [...crumbs, { href, title: page, label: page }];

    const { task, run } = loaded;
    if (task?.editor || run?.editor) {
      crumbs.push({
        href: "/live",
        title: "Editor",
        label: <Labelled icon="code">Editor</Labelled>,
      });
    } else if (task) {
      crumbs.push({
        href: `/tasks/${task.id}`,
        title: task.path,
        label: <Labelled icon="task">{task.file}</Labelled>,
      });
    }
    if (run) {
      crumbs.push({
        href: `/tasks/${run.task_id}/runs/${run.id}`,
        title: `Run #${run.id}`,
        label: (
          <>
            <Dot tone={runMark(run.status, run.stalled)} />
            <span className={mono}>#{run.id}</span>
          </>
        ),
      });
    }
    // A page that says nothing about where it sits still gets a layer.
    if (crumbs.length === 1) crumbs.push({ href, title: path, label: path });
    return crumbs;
  }, [loaded, path, href]);
}

function Labelled({ icon, children }: { icon: "task" | "code"; children: React.ReactNode }) {
  return (
    <>
      <span className={css({ display: "inline-flex", flexShrink: 0 })}>
        {icon === "task" ? <IconTask size={12} /> : <IconCode size={12} />}
      </span>
      <span className={truncate}>{children}</span>
    </>
  );
}

const crumb = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  minW: "0",
  color: "muted",
  textDecoration: "none",
  whiteSpace: "nowrap",
  _hover: { color: "accent" },
});

/** The crumbs, over the canvas and every layer: the way back up from anywhere. */
export function CrumbBar() {
  const crumbs = useCrumbs();
  const navigate = useNavigate();
  const depth = crumbs.length - 1;
  const sep = (
    <span className={css({ color: "faint", display: "inline-flex", flexShrink: 0 })}>
      <IconChevronRight size={12} />
    </span>
  );

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "1",
        h: "34px",
        pl: "4",
        pr: "1.5",
        flexShrink: 0,
        borderTop: "1px solid {colors.line}",
        bg: "chrome",
      })}
    >
      <nav
        aria-label="Where this is"
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "1.5",
          minW: "0",
          fontSize: "12px",
        })}
      >
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 ? sep : null}
            {i === depth ? (
              <span
                aria-current="page"
                title={c.title}
                className={cx(crumb, css({ color: "fg", _hover: { color: "fg" } }))}
              >
                {c.label}
              </span>
            ) : (
              <a
                href={c.href}
                title={c.title}
                className={crumb}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  void navigate({ href: c.href });
                }}
              >
                {c.label}
              </a>
            )}
          </React.Fragment>
        ))}
        {depth === 0 ? (
          <span className={css({ color: "faint", ml: "2" })}>
            Open a task or a run to look inside it
          </span>
        ) : null}
      </nav>
      {depth > 0 ? (
        <div className={css({ ml: "auto" })}>
          <IconButton label="Back to the canvas" onClick={() => void navigate({ to: "/" })}>
            <IconClose size={14} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// The layers themselves
// -----------------------------------------------------------------------------

/**
 * The open page: one flat sheet covering the canvas, under the crumbs. It keeps
 * one view-transition name at every depth, so the browser animates a change of
 * page as one sheet flying in over another, or flying out to show the one
 * below (see globals.css and layerTransition in router.tsx).
 */
export function Layers({ children }: { children: React.ReactNode }) {
  const crumbs = useCrumbs();
  const navigate = useNavigate();
  const depth = crumbs.length - 1;
  const up = crumbs[depth - 1]?.href ?? "/";

  React.useEffect(() => {
    if (depth === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        target.blur();
        return;
      }
      // A menu or the palette closes first.
      if (target?.isContentEditable) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      void navigate({ href: up });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depth, up, navigate]);

  if (depth === 0) return null;

  return (
    <section
      aria-label={crumbs[depth]!.title}
      style={{ viewTransitionName: "layer" } as React.CSSProperties}
      className={css({
        position: "absolute",
        inset: "0",
        zIndex: 5,
        display: "flex",
        flexDir: "column",
        overflow: "hidden",
        bg: "canvas",
      })}
    >
      {children}
    </section>
  );
}

/** How deep the open page is: 0 on the canvas. */
export function useDepth(): number {
  return useCrumbs().length - 1;
}
