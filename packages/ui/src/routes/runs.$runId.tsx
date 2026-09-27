// A bare run link — an older bookmark or a remembered tab — sent on to the run
// under its task, where runs are shown.

import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { getRunTaskId } from "~/server/api";

export const Route = createFileRoute("/runs/$runId")({
  loader: async ({ params, location }) => {
    const taskId = await getRunTaskId({ data: { runId: params.runId } });
    if (taskId == null) throw notFound();
    throw redirect({
      to: "/tasks/$taskId/runs/$runId",
      params: { taskId: String(taskId), runId: params.runId },
      search: location.search,
      replace: true,
    });
  },
});
