// What is open right now, read off the matched routes' loader data, so the
// sidebar can highlight and expand to it without every page reporting in.

import { useRouterState } from "@tanstack/react-router";

export interface Active {
  taskId: number | null;
  runId: number | null;
}

type Loaded = {
  run?: { id: number; task_id: number };
  task?: { id: number };
} | null;

export function useActive(): Active {
  return useRouterState({
    select: (state) => {
      const active: Active = { taskId: null, runId: null };
      for (const match of state.matches) {
        const data = match.loaderData as Loaded | undefined;
        if (!data || typeof data !== "object") continue;
        if (data.task) active.taskId = data.task.id;
        if (data.run) {
          active.runId = data.run.id;
          active.taskId = data.run.task_id;
        }
      }
      return active;
    },
    structuralSharing: true,
  });
}
