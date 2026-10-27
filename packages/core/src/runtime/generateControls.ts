import {
  logTaskCallback,
  logTaskConsoleError,
  logTaskConsoleInfo,
  logTaskConsoleWarn,
} from "@apisurf/ngn-os";
import invariant from "tiny-invariant";
import { Client } from "@apisurf/ngn-persistence";
import {
  BuildCompiledTaskConfigFn,
  CompiledTaskCallbacks,
  RunControls,
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
import { createRunLocks } from "./locks.js";

// higher order function that returns a function that builds a task config
export function createControlsGenerator({
  dbClient,
  env,
}: {
  dbClient: Client;
  env: TaskContext["env"];
}) {
  const taskRunService = new TaskRunService(dbClient);
  const logService = new LogService(dbClient);
  const kvService = new KVService(dbClient);
  const timingService = new TimingService(dbClient);
  const lockService = new LockService(dbClient);

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
        async onNotFound() {
          await logService.logError(taskId, runId, "Task not found");
          logTaskCallback(`Task not found: ${taskId}, run ID: ${runId}`);
        },
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
        async onFailure() {
          await taskRunService.endTaskRun(runId, "failure");
          await logService.logError(taskId, runId, "Task failed");
          logTaskCallback(`Task failed: ${taskId}, run ID: ${runId}`);
        },
        async onSuccess({ result }) {
          await taskRunService.endTaskRun(runId, "success", serializeResult(result));
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
      env,
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
