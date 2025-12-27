import { z } from "zod";
import { get, getSearchQuery } from "../api";
import { $fileTask, $log } from "op3-schema";

const logsSchema = z.array(
  z.object({
    file_task_id: z.number(),
    task_run_id: z.number(),
    log_id: z.number(),
    created_at: z.number(),
    path: $fileTask.shape.path,
    status: $log.shape.status,
    value: $log.shape.value,
  })
);

export const fetchLogs = async ({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) => {
  const res = await get(`/logs?${getSearchQuery({ search, status })}`);

  return logsSchema.parse(res.items);
};
