import { z } from "zod";
import { get, getSearchQuery } from "../api";
import { $fileTask, $timing } from "op3-schema";

const timingsSchema = z.array(
  z.object({
    file_task_id: z.number(),
    task_run_id: z.number(),
    timing_id: z.number(),
    label: $timing.shape.label,
    value: $timing.shape.value,
    path: $fileTask.shape.path,
  })
);

export const fetchTimings = async ({ search }: { search?: string }) => {
  const res = await get(`/timings?${getSearchQuery({ search })}`);

  return timingsSchema.parse(res.items);
};
