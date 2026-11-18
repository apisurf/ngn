// The canvas: the map of the project. Tasks on the left (task files as a tree
// of their folders, then the Editor), their latest runs on the right, and a
// faint line from each run back to its task.
//
// It is the bottom layer every page sits on. A page opens as a flat layer over
// it (see ./layers), and under it the canvas marks what that page is about (a
// task, a run) and centres it, so closing the layers lands you where you were
// looking. Hovering a task or a run lights up what it is tied to.
//
// React Flow draws it and handles the viewport. Where things go is ./layout;
// nothing is dragged into place.

import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { NodeMouseHandler, ReactFlowInstance } from "@xyflow/react";
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import * as React from "react";
import { css } from "styled-system/css";
import { runTone } from "~/lib/ngn";
import type { CanvasActions } from "./context";
import { CanvasActionsContext } from "./context";
import { focusNodeIds, useFocus } from "./focus";
import type { CanvasEdge, CanvasNode, Hover } from "./layout";
import { layout } from "./layout";
import {
  BatchNode,
  EditorNode,
  FolderNode,
  HeadingNode,
  LinkEdge,
  OlderNode,
  RunNode,
  SectionNode,
  TaskNode,
  TreeEdge,
} from "./nodes";

const root = getRouteApi("__root__");

const NODE_TYPES = {
  heading: HeadingNode,
  section: SectionNode,
  folder: FolderNode,
  task: TaskNode,
  editor: EditorNode,
  batch: BatchNode,
  run: RunNode,
  older: OlderNode,
};

const EDGE_TYPES = { tree: TreeEdge, link: LinkEdge };

/** The farthest out the canvas zooms by itself when it brings something into view. */
const MIN_FOCUS_ZOOM = 0.5;

const VIEWPORT_KEY = "ngnui:canvas-viewport";

export function Canvas({ covered }: { covered: boolean }) {
  const ws = root.useLoaderData();
  const navigate = useNavigate();
  const { focus, focusKey } = useFocus();
  const [hover, setHover] = React.useState<Hover>(null);
  const [flow, setFlow] = React.useState<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();

  const { nodes, edges } = React.useMemo(
    () =>
      layout({
        tasks: ws.tasks,
        runs: ws.recentRuns,
        totalRuns: ws.counts?.runs ?? ws.recentRuns.length,
        focus,
        hover,
      }),
    [ws.tasks, ws.recentRuns, ws.counts, focus, hover],
  );

  const open = React.useCallback((href: string) => void navigate({ href }), [navigate]);
  const actions = React.useMemo<CanvasActions>(() => ({ open }), [open]);

  const onNodeClick = React.useCallback<NodeMouseHandler<CanvasNode>>(
    (_, node) => {
      const href = hrefOf(node);
      if (href) open(href);
    },
    [open],
  );

  const onNodeMouseEnter = React.useCallback<NodeMouseHandler<CanvasNode>>((_, node) => {
    if (node.type === "task") setHover({ source: node.data.task.id });
    else if (node.type === "editor") setHover({ source: "editor" });
    else if (node.type === "run") setHover({ runId: node.data.run.id });
    else setHover(null);
  }, []);
  const onNodeMouseLeave = React.useCallback(() => setHover(null), []);

  // Centre what the open page is about, once per focus, unless it is already in
  // view, so closing the layers lands on it.
  const centered = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!flow || centered.current === focusKey) return;
    const target = focusNodeIds(focus)
      .map((id) => nodes.find((n) => n.id === id))
      .find((n) => n !== undefined);
    const box = wrapper.current?.getBoundingClientRect();
    if (!target || !box) return;
    centered.current = focusKey;
    const { x: x0, y: y0 } = target.position;
    const w = target.width ?? 0;
    const h = target.height ?? 0;
    const { x: tx, y: ty, zoom } = flow.getViewport();
    const margin = 40;
    const room = { w: box.width - margin * 2, h: box.height - margin * 2 };
    const left = x0 * zoom + tx;
    const top = y0 * zoom + ty;
    const inView =
      left >= margin &&
      top >= margin &&
      left + w * zoom <= room.w + margin &&
      top + h * zoom <= room.h + margin;
    if (inView) return;
    // Close enough to read, and far enough out that all of it fits when it can.
    const z = Math.max(MIN_FOCUS_ZOOM, Math.min(Math.max(zoom, 0.75), room.w / w, 1));
    const cx = w * z <= room.w ? x0 + w / 2 : x0 + room.w / 2 / z;
    const cy = h * z <= room.h ? y0 + h / 2 : y0 + room.h / 2 / z;
    void flow.setCenter(cx, cy, { zoom: z, duration: 450 });
  }, [flow, nodes, focus, focusKey]);

  // F: everything in view. Only while the canvas is what is on screen.
  React.useEffect(() => {
    if (covered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      if (event.key === "f") void flow?.fitView({ duration: 400, padding: 0.1 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow, covered]);

  // The viewport is the browser's (stored, or fit to the window), so the
  // canvas is drawn there and not on the server.
  const [stored, setStored] = React.useState<ReturnType<typeof readViewport> | undefined>(
    undefined,
  );
  React.useEffect(() => setStored(readViewport()), []);
  // Opened on a page, the canvas frames what that page is about; otherwise it
  // starts with everything in view. Not both: the fit would undo the framing.
  const [openedOnFocus] = React.useState(() => focusNodeIds(focus).length > 0);
  if (stored === undefined) return null;

  return (
    <CanvasActionsContext.Provider value={actions}>
      {/* Its own view-transition group, so it stays put while layers drop onto
          it or fall through to it. Inert while a layer covers it. */}
      <div
        ref={wrapper}
        inert={covered}
        style={{ viewTransitionName: "canvas" } as React.CSSProperties}
        className={css({ position: "absolute", inset: "0" })}
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={setFlow}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          colorMode={theme}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          // Scroll pans, as on every other canvas; pinch or ⌘-scroll zooms.
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          minZoom={0.1}
          maxZoom={2}
          {...(stored
            ? { defaultViewport: stored }
            : openedOnFocus
              ? {}
              : { fitView: true, fitViewOptions: { padding: 0.1, maxZoom: 1 } })}
          onMoveEnd={(_, viewport) => writeViewport(viewport)}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap<CanvasNode>
            position="bottom-left"
            pannable
            zoomable
            style={{ marginLeft: 56, width: 180, height: 120 }}
            nodeColor={minimapColor}
            nodeStrokeWidth={0}
            nodeBorderRadius={4}
          />
        </ReactFlow>
      </div>
    </CanvasActionsContext.Provider>
  );
}

/** Where clicking a node goes. A row's own button does its own thing. */
function hrefOf(node: CanvasNode): string | null {
  switch (node.type) {
    case "task":
      return `/tasks/${node.data.task.id}`;
    case "editor":
      return "/live";
    case "run":
      return `/tasks/${node.data.run.task_id}/runs/${node.data.run.id}`;
    default:
      return null;
  }
}

/** The minimap keeps the canvas's rule: grey is the normal case, colour needs a look. */
const MINIMAP_TONE: Record<string, string> = {
  ok: "var(--colors-line-strong)",
  bad: "var(--colors-bad)",
  warn: "var(--colors-warn)",
  info: "var(--colors-info)",
  neutral: "var(--colors-line-strong)",
};

function minimapColor(node: CanvasNode): string {
  switch (node.type) {
    case "task":
      return node.data.task.last_outcome === "failure" ? MINIMAP_TONE.bad! : MINIMAP_TONE.neutral!;
    case "run":
      return MINIMAP_TONE[runTone(node.data.run.status, node.data.run.stalled)]!;
    case "editor":
    case "folder":
      return MINIMAP_TONE.neutral!;
    default:
      return "transparent";
  }
}

// -----------------------------------------------------------------------------
// Small stored state
// -----------------------------------------------------------------------------

function readViewport(): { x: number; y: number; zoom: number } | null {
  try {
    const raw = sessionStorage.getItem(VIEWPORT_KEY);
    const v = raw ? (JSON.parse(raw) as { x: number; y: number; zoom: number }) : null;
    return v && [v.x, v.y, v.zoom].every(Number.isFinite) ? v : null;
  } catch {
    return null;
  }
}

function writeViewport(viewport: { x: number; y: number; zoom: number }) {
  try {
    sessionStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
  } catch {
    // Lasts as long as the page.
  }
}

/** The theme on screen, as the boot script and the theme setting set it. */
function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  React.useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.dataset.theme === "dark" ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
