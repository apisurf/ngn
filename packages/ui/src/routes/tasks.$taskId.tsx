// A task: one file, across every run of it.
//
// This layout only loads the task. Each page under it draws the task's header
// (./components/task-header) with its own content inside the band: the task's
// tabs, or one run's title, figures and tabs. So the band is one piece however
// much of it a page fills.

import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { css } from "styled-system/css";
import { useUnreadable } from "~/components/states";
import { getTask } from "~/server/api";

export const Route = createFileRoute("/tasks/$taskId")({
  loader: async ({ params }) => {
    const page = await getTask({ data: { taskId: params.taskId } });
    if (!page) throw notFound();
    return page;
  },
  component: TaskLayout,
});

function TaskLayout() {
  const unreadable = useUnreadable();
  if (unreadable) return unreadable;
  return (
    <div className={css({ display: "flex", flexDir: "column", h: "full", minH: "0" })}>
      <Outlet />
    </div>
  );
}
