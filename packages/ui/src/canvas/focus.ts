// What the open layer is about, read off the matched routes, so the canvas can
// mark it and bring it into view without any page reporting in.

import { useRouterState } from "@tanstack/react-router";
import * as React from "react";
import type { Focus } from "./layout";
import { nodeId, sourceOf } from "./layout";

interface Loaded {
  run?: { id: number; task_id: number; editor: boolean };
  task?: { id: number; editor: boolean };
}

export function useFocus(): { focus: Focus; focusKey: string } {
  const focusKey = useRouterState({
    select: (state) => {
      const focus: Focus = {};
      for (const match of state.matches) {
        if (match.routeId === "/live") focus.source = "editor";
        const data = match.loaderData as Loaded | undefined;
        if (!data || typeof data !== "object") continue;
        if (data.task && !Array.isArray(data.task)) {
          focus.source = data.task.editor ? "editor" : data.task.id;
        }
        if (data.run) {
          focus.source = sourceOf(data.run);
          focus.runId = data.run.id;
        }
      }
      return JSON.stringify(focus);
    },
  });
  const focus = React.useMemo(() => JSON.parse(focusKey) as Focus, [focusKey]);
  return { focus, focusKey };
}

/**
 * The nodes that stand for the focus, best first: its run, its task. A run
 * older than the runs column has no node, so its task stands in.
 */
export function focusNodeIds(focus: Focus): string[] {
  const ids: string[] = [];
  if (focus.runId != null) ids.push(nodeId.run(focus.runId));
  if (focus.source != null) ids.push(nodeId.source(focus.source));
  return ids;
}
