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
  /** What the task returned, as JSON. */
  result: z.string().nullable(),
  /** The first run of the tick this run retries; null for a first attempt. */
  retry_of: z.number().nullable(),
  /** Why ngn skipped the run; null when it was not skipped, or `shouldSkip` did it. */
  skip_reason: z.string().nullable(),
  /** For a tick's final run: when the next run was set for, after it. */
  next_at: z.number().nullable(),
  /** Why the next run was set for then, in words. */
  next_reason: z.string().nullable(),
});

export const $taskRunInsert = $taskRun.omit({
  id: true,
  created_at: true,
  started_at: true,
  ended_at: true,
  result: true,
  retry_of: true,
  skip_reason: true,
  next_at: true,
  next_reason: true,
});

export const $scheduleState = z.enum(["waiting", "blocked", "running", "paused"]);

/** A scheduled task's schedule: the fold of its `schedule_events`. */
export const $schedule = z.object({
  file_task_id: z.number(),
  state: $scheduleState,
  next_at: z.number().nullable(),
  reason: z.string().nullable(),
  /** Who set the next run: `policy`, `hook` or `cli`. */
  source: z.string().nullable(),
  /** The lease holder (`<pid>:<uuid>`) holding the task, or blocking it. */
  holder: z.string().nullable(),
  /** The leading edge's grid anchor. */
  anchor: z.number().nullable(),
  /** A request from the CLI waiting for the tick in progress to end. */
  request: z.string().nullable(),
  updated_at: z.number(),
});

/** One transition of a schedule, with the row as it left it. */
export const $scheduleEvent = z.object({
  id: z.number(),
  file_task_id: z.number(),
  at: z.number(),
  event: z.string(),
  from_state: $scheduleState.nullable(),
  to_state: $scheduleState,
  next_at: z.number().nullable(),
  reason: z.string().nullable(),
  source: z.string().nullable(),
  holder: z.string().nullable(),
  anchor: z.number().nullable(),
  request: z.string().nullable(),
  /** For `started`: scheduled, catch-up or manual. */
  origin: z.string().nullable(),
  first_run_id: z.number().nullable(),
  run_id: z.number().nullable(),
  /** The next run before the event, where it moved it. */
  previous_next_at: z.number().nullable(),
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
