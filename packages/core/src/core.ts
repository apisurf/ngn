export { Compiler } from "./source/compiler.js";
export { executeEsm } from "./runtime/vm.js";
export { failedRunId, runFailure, Task } from "./runtime/task.js";
export type { ExecuteSchedule, TickOutcome, TickStatus } from "./runtime/task.js";
export { TaskLibrary } from "./runtime/taskLibrary.js";
export { TaskLibraryScheduler } from "./runtime/taskLibraryScheduler.js";
export type { RunNowOutcome, ScheduleReport } from "./runtime/taskLibraryScheduler.js";
export { TaskOnceRunner } from "./runtime/taskOnceRunner.js";
export { isCronPatternValid } from "./runtime/cron.js";
export { resolveTiming, timingFromFlag } from "./runtime/timing.js";
export type {
  Edge,
  IntervalTiming,
  ResolvedTiming,
  TimingBackoff,
  TimingExport,
} from "./runtime/timing.js";
export { runOnce, STOP_GRACE_MS } from "./runtime/taskSchedule.js";
export { controlSchedule } from "./runtime/scheduleControl.js";
export type {
  ScheduleCommand,
  ScheduleControlResult,
  ScheduleControlTarget,
} from "./runtime/scheduleControl.js";
export { ScheduleStore } from "./db/services/schedule.js";
export { systemClock } from "./runtime/clock.js";
export type { Clock } from "./runtime/clock.js";
export { setupDbClient, getDbClient } from "./db/db.js";
export { initDbFileIfNotExists } from "./db/db.js";
export { createControlsGenerator } from "./runtime/generateControls.js";
export { TaskContext } from "./source/types.js";
export type {
  NextDecision,
  NextDelay,
  NextOutcome,
  OverlapPolicy,
  TaskRun,
} from "./source/types.js";
export type { RunProblem, RunStage } from "./runtime/types.js";
export type { Duration } from "./runtime/duration.js";
export { LockBusyError } from "./runtime/locks.js";
export type { LockOptions } from "./runtime/locks.js";
export { Queue } from "./runtime/queue/queue.js";
export type {
  AddJob,
  Backoff,
  ClaimOptions,
  Job,
  JobFilter,
  QueueOptions,
  QueueStats,
} from "./runtime/queue/queue.js";
export type { JobStatus } from "./runtime/queue/schema.js";
export type { WorkHandler, WorkOptions, WorkSummary, WorkerHandle } from "./runtime/queue/work.js";

// Per-task SQLite, injected as ctx.sqlite
export { closeTaskDatabases, releaseTaskDatabases } from "./runtime/taskSqlite.js";
export type { TaskSqlite, DBInstance, InitDBOptions, Migration } from "./runtime/taskSqlite.js";
