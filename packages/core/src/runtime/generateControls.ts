import {
  logTaskCallback,
  logTaskConsoleError,
  logTaskConsoleInfo,
  logTaskConsoleWarn,
} from "@apisurf/ngn-os";
import invariant from "tiny-invariant";
import { Client } from "@apisurf/ngn-persistence";
import { errorSummary, failureLine } from "@apisurf/ngn-schema/describe";
import {
  BuildCompiledTaskConfigFn,
  CompiledTaskCallbacks,
  RunControls,
  RunProblem,
  TaskRuntimeCallbacks,
} from "./types.js";
import { TaskContext } from "../source/types.js";
import { createTaskSqlite } from "./taskSqlite.js";
import { registerFileTask } from "../db/services/registerTask.js";
import { TaskRunService, serializeResult } from "../db/services/taskRun.js";
import { LogService } from "../db/services/log.js";
import { KVService } from "../db/services/kv.js";
import { TimingService } from "../db/services/timing.js";
import { LockService } from "../db/services/lock.js";
import { ScheduleStore } from "../db/services/schedule.js";
import { createRunLocks } from "./locks.js";

/**
 * Write to a run's record, and never throw: a failure that cannot be
 * recorded must still reach `report`, and must not replace the error it is
 * about.
 */
async function recordSafely(runId: number, write: () => Promise<unknown>) {
  try {
    await write();
  } catch (error) {
    logTaskCallback(`Could not record what run ${runId} threw: ${errorSummary(error)}`);
  }
}

/**
 * The line a run gets when it ends after ngn already closed it as interrupted
 * (ngn stopped, or recovery found its lease expired): its row keeps what ngn
 * recorded, and this says how it really came out.
 */
const lateEnd = (outcome: string) => `finished after ngn closed it as interrupted: ${outcome}`;

// higher order function that returns a function that builds a task config
export function createControlsGenerator({
  dbClient,
  env,
  report,
}: {
  dbClient: Client;
  /** A missing env file is null from the readers; tasks always get an object. */
  env: TaskContext["env"] | null | undefined;
  /** Told about everything a run throws, after it is recorded. The CLI prints it. */
  report?: (problem: RunProblem) => void;
}) {
  const taskRunService = new TaskRunService(dbClient);
  const logService = new LogService(dbClient);
  const kvService = new KVService(dbClient);
  const timingService = new TimingService(dbClient);
  const lockService = new LockService(dbClient);
  const scheduling = { store: new ScheduleStore(dbClient), locks: lockService };

  // wrap in a function to allow for partial application of dbClient
  const generateControls: BuildCompiledTaskConfigFn = ({ sourcePath, compiledPath }) => {
    // Per task, not per run: every run of one file shares its task and version.
    let fileTaskId: number;
    let fileTaskVersionId: number;

    const assertMandatoryIds = () => {
      invariant(!!fileTaskId, "Task ID not found");
      invariant(!!fileTaskVersionId, "Task version ID not found");
    };

    const taskCallbacks: CompiledTaskCallbacks = {
      async onTaskLoadComplete({ paths, md5Hash, compiledCode }) {
        const result = await registerFileTask(dbClient, md5Hash, compiledCode, {
          relativeEntry: paths.relativeEntry,
          relativeParent: paths.relativeParent,
        });

        fileTaskId = result.fileTaskId;
        fileTaskVersionId = result.fileVersionId;

        return {
          fileTaskId,
          fileTaskVersionId,
        };
      },
      async onTaskCodeLoaded() {
        // console.log("Task code loaded");
      },
      async onTaskExportsLoaded() {
        // console.log("Task exports loaded");
      },
    };

    async function startRun({
      retryOf = null,
    }: { retryOf?: number | null } = {}): Promise<RunControls> {
      assertMandatoryIds();
      // Captured here, so a later run of the same task cannot redirect this one.
      const taskId = fileTaskId;
      const runId = await taskRunService.initTaskRun({
        file_task_id: taskId,
        file_task_version_id: fileTaskVersionId,
        retry_of: retryOf,
      });

      const callbacks: TaskRuntimeCallbacks = {
        async onSkip({ reason }) {
          await taskRunService.skipTaskRun(runId, reason ?? null);
          await logService.logInfo(taskId, runId, "Task skipped");
          if (reason) await logService.logInfo(taskId, runId, `Skipped: ${reason}`);
          logTaskCallback(`Task skipped: ${taskId}, run ID: ${runId}`);
        },
        async onStart() {
          await taskRunService.startTaskRun(runId);
          await logService.logInfo(taskId, runId, "Task started");
          logTaskCallback(`Task started: ${taskId}, run ID: ${runId}`);
        },
        async onFailure({ path, stage, error }) {
          await recordSafely(runId, async () => {
            if (!(await taskRunService.endTaskRun(runId, "failure"))) {
              await logService.logError(taskId, runId, failureLine(stage, error));
              await logService.logWarning(taskId, runId, lateEnd("failed"));
              return;
            }
            await logService.logError(taskId, runId, failureLine(stage, error));
            await logService.logError(taskId, runId, "Task failed");
          });
          logTaskCallback(`Task failed in ${stage}: ${taskId}, run ID: ${runId}`);
          report?.({ path, runId, stage, error, fatal: true });
        },
        async onHookError({ path, stage, error }) {
          await recordSafely(runId, () =>
            logService.logError(taskId, runId, failureLine(stage, error)),
          );
          logTaskCallback(`Hook ${stage} threw: ${taskId}, run ID: ${runId}`);
          report?.({ path, runId, stage, error, fatal: false });
        },
        async onSuccess({ result }) {
          if (!(await taskRunService.endTaskRun(runId, "success", serializeResult(result)))) {
            await logService.logWarning(taskId, runId, lateEnd("succeeded"));
            return;
          }
          await logService.logInfo(taskId, runId, "Task succeeded");
          logTaskCallback(`Task succeeded: ${taskId}, run ID: ${runId}`);
        },
      };

      return {
        id: runId,
        callbacks,
        locks: createRunLocks(lockService, runId),
        log: {
          async info(value: string) {
            logTaskConsoleInfo(value);
            await logService.logInfo(taskId, runId, value);
          },
          async error(value: string) {
            logTaskConsoleError(value);
            await logService.logError(taskId, runId, value);
          },
          async warning(value: string) {
            logTaskConsoleWarn(value);
            await logService.logWarning(taskId, runId, value);
          },
        },
        timing: {
          start(label) {
            return timingService.start(taskId, runId, label);
          },
        },
      };
    }

    return {
      compiledPath,
      sourcePath,
      taskCallbacks: taskCallbacks,
      startRun,
      history: {
        recentTickOutcomes(limit: number) {
          assertMandatoryIds();
          return taskRunService.recentTickOutcomes(fileTaskId, limit);
        },
        countSkipsSince(reason: string, afterId: number) {
          assertMandatoryIds();
          return taskRunService.countSkipsSince(fileTaskId, reason, afterId);
        },
      },
      scheduling,
      env: env ?? {},
      // Scoped to this task's own folder — see createTaskSqlite
      sqlite: createTaskSqlite(sourcePath),
      kv: {
        async set(key: string, value: string) {
          await kvService.setValue(fileTaskId, key, value);
        },
        async get(key: string) {
          return kvService.getValue(fileTaskId, key);
        },
        async delete(key: string) {
          await kvService.deleteValue(fileTaskId, key);
        },
      },
    };
  };

  return generateControls;
}
