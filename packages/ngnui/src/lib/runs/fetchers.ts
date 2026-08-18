import { $fileTask, $taskRun } from "ngn-schema";
import { z } from "zod";
import { get, getSearchQuery } from "../api";

const runsSchema = z.array(
  z.object({
    id: z.number(),
    path: $fileTask.shape.path,
    status: $taskRun.shape.status,
    started_at: z.number().nullable(),
    ended_at: z.number().nullable(),
    duration: z.number().nullable(),
    version: z.number(),
  }),
);

export const fetchRuns = async ({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) => {
  const res = await get(`/runs?${getSearchQuery({ search, status })}`);
  return runsSchema.parse(res.items);
};
