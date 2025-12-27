import { z } from "zod";
import { get } from "../api";

export const fetchTasksCount = async () => {
  const res = await get("/dashboard/tasks-count");
  return z
    .object({
      total: z.number(),
      active: z.number(),
    })
    .parse(res);
};

export const fetchTaskRunsCount = async () => {
  const res = await get("/dashboard/task-runs-count");
  return z
    .object({
      pending: z.number(),
      skipped: z.number(),
      running: z.number(),
      success: z.number(),
      failure: z.number(),
      total: z.number(),
    })
    .parse(res);
};

export const fetchLogEntries = async () => {
  const res = await get("/dashboard/log-entries");
  return z
    .object({
      total: z.number(),
      errors: z.number(),
      latest_error: z.number().nullable(),
    })
    .parse(res);
};

export const fetchTaskRunTrends = async (
  range: "hour" | "day" | "week" = "hour"
) => {
  const res = await get(`/dashboard/task-run-trends?range=${range}`);
  return z
    .array(
      z.object({
        bucket_timestamp: z.number(),
        time: z.string(),
        success_count: z.number(),
        skipped_count: z.number(),
        failure_count: z.number(),
      })
    )
    .parse(res);
};
