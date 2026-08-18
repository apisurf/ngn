import {
  $fileTask,
  $fileTaskVersion,
  $kv,
  $log,
  $taskRun,
  $timing,
} from "ngn-schema";
import { z } from "zod";
import { get, getSearchQuery } from "../api";

export const listFileTasksSimple = async () => {
  const res = await get("/file-tasks/simple");

  return z
    .array(
      z.object({
        id: z.number(),
        path: $fileTask.shape.path,
        parent_path: $fileTask.shape.parent_path,
        status: $fileTask.shape.status,
      }),
    )
    .parse(res);
};

export const listTaskActivity = async () => {
  const res = await get("/file-tasks/activity");
  return z
    .array(
      z.object({
        task_run_id: z.number(),
        path: $fileTask.shape.path,
        status: $taskRun.shape.status,
        created_at: z.number(),
      }),
    )
    .parse(res);
};

const tasklistSchema = z.array(
  z.object({
    id: z.number(),
    created_at: $fileTask.shape.created_at,
    last_run_started_at: $taskRun.shape.started_at,
    last_version: $fileTaskVersion.shape.version,
    last_version_created_at: $fileTaskVersion.shape.created_at,
    path: $fileTask.shape.path,
    status: $fileTask.shape.status,
    run_count: z.number(),
  }),
);

export const listFileTasks = async ({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) => {
  const res = await get(`/file-tasks?${getSearchQuery({ search, status })}`);

  return tasklistSchema.parse(res.items);
};

const fileTaskSchema = z.object({
  id: z.number(),
  created_at: $fileTask.shape.created_at,
  last_run_started_at: $taskRun.shape.started_at,
  last_version: $fileTaskVersion.shape.version,
  last_version_created_at: $fileTaskVersion.shape.created_at,
  path: $fileTask.shape.path,
  status: $fileTask.shape.status,
});

export const fetchFileTask = async (id: string) => {
  const res = await get(`/file-tasks/${id}`);
  return fileTaskSchema.parse(res.item);
};

const fileTaskRunsSchema = z.array(
  z.object({
    id: z.number(),
    task_version: $fileTaskVersion.shape.version,
    run_status: $taskRun.shape.status,
    started_at: $taskRun.shape.started_at,
    ended_at: $taskRun.shape.ended_at,
    run_duration: z.number().nullable(),
  }),
);

export const fetchFileTaskRuns = async (id: string) => {
  const res = await get(`/file-tasks/${id}/runs`);
  return fileTaskRunsSchema.parse(res.items);
};

const fileTaskKvsSchema = z.array(
  z.object({
    id: z.number(),
    key: $kv.shape.key,
    value: $kv.shape.value,
    file_task_id: z.number(),
    created_at: $kv.shape.created_at,
  }),
);

export const fetchFileTaskKvs = async (id: string) => {
  const res = await get(`/file-tasks/${id}/kvs`);
  return fileTaskKvsSchema.parse(res.items);
};

const fileTaskLogsSchema = z.array(
  z.object({
    id: z.number(),
    log_status: $log.shape.status,
    log_value: $log.shape.value,
    task_path: $fileTask.shape.path,
    task_run_id: z.number(),
    log_created_at: $log.shape.created_at,
  }),
);

export const fetchFileTaskLogs = async (id: string) => {
  const res = await get(`/file-tasks/${id}/logs`);
  return fileTaskLogsSchema.parse(res.items);
};

const fileTaskTimingsSchema = z.array(
  z.object({
    id: z.number(),
    label: $timing.shape.label,
    value: $timing.shape.value,
    created_at: $timing.shape.created_at,
  }),
);

export const fetchFileTaskTimings = async (id: string) => {
  const res = await get(`/file-tasks/${id}/timings`);
  return fileTaskTimingsSchema.parse(res.items);
};

const fileTaskVersionsSchema = z.array(
  z.object({
    id: z.number(),
    md5_hash: $fileTaskVersion.shape.md5_hash,
    version: $fileTaskVersion.shape.version,
    file_task_id: z.number(),
    created_at: $fileTaskVersion.shape.created_at,
  }),
);

export const fetchFileTaskVersions = async (id: string) => {
  const res = await get(`/file-tasks/${id}/versions`);
  return fileTaskVersionsSchema.parse(res.items);
};
