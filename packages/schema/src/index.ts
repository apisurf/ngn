import { z } from "zod";

export const $fileTask = z.object({
  id: z.number(),
  path: z.string().nonempty(),
  parent_path: z.string().nonempty(),
  created_at: z.number(),
  updated_at: z.number(),
  status: z.enum(["active", "archived", "error"]),
});

export const $fileTaskInsert = $fileTask.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const $fileTaskVersion = z.object({
  id: z.number(),
  file_task_id: z.number(),
  version: z.number(),
  md5_hash: z.string().nonempty(),
  compiled_code: z.string().nonempty(),
  created_at: z.number(),
});

export const $fileTaskVersionInsert = $fileTaskVersion.omit({
  id: true,
  created_at: true,
});

export const $kv = z.object({
  id: z.number(),
  created_at: z.number(),
  file_task_id: z.number(),
  key: z.string().nonempty(),
  value: z.string().nullable(),
});

export const $kvInsert = $kv.omit({
  id: true,
  created_at: true,
});

export const $taskRun = z.object({
  id: z.number(),
  created_at: z.number(),
  started_at: z.number().nullable(),
  ended_at: z.number().nullable(),
  status: z.enum(["pending", "skipped", "running", "success", "failure"]),
  file_task_id: z.number(),
  file_task_version_id: z.number(),
});

export const $taskRunInsert = $taskRun.omit({
  id: true,
  created_at: true,
  started_at: true,
  ended_at: true,
});

export const $timing = z.object({
  id: z.number(),
  created_at: z.number(),
  label: z.string().nonempty(),
  value: z.number(),
  file_task_id: z.number(),
  task_run_id: z.number(),
});

export const $timingInsert = $timing.omit({
  id: true,
  created_at: true,
});

export const $log = z.object({
  id: z.number(),
  created_at: z.number(),
  status: z.enum(["info", "warn", "error"]),
  value: z.string().nonempty(),
  file_task_id: z.number(),
  task_run_id: z.number(),
});

export const $logInsert = $log.omit({
  id: true,
  created_at: true,
});
