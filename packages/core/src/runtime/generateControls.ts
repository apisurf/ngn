import {
  logTaskCallback,
  logTaskConsoleError,
  logTaskConsoleInfo,
  logTaskConsoleWarn,
} from "op3-os";
import invariant from "tiny-invariant";
import { Client } from "op3-persistence";
import {
  BuildCompiledTaskConfigFn,
  CompiledTaskCallbacks,
  TaskRuntimeCallbacks,
} from "./types.js";
import { EntryContext } from "../source/types.js";
import { registerFileTask } from "../db/services/registerTask.js";
import { TaskRunService } from "../db/services/taskRun.js";
import { LogService } from "../db/services/log.js";
import { KVService } from "../db/services/kv.js";
import { TimingService } from "../db/services/timing.js";

// higher order function that returns a function that builds a task config
export function createControlsGenerator({
  dbClient,
  env,
}: {
  dbClient: Client;
  env: EntryContext["env"];
}) {
  const taskRunService = new TaskRunService(dbClient);
  const logService = new LogService(dbClient);
  const kvService = new KVService(dbClient);
  const timingService = new TimingService(dbClient);

  // wrap in a function to allow for partial application of dbClient
  const generateControls: BuildCompiledTaskConfigFn = ({
    sourcePath,
    compiledPath,
  }) => {
    let fileTaskId: number;
    let fileTaskVersionId: number;
    let fileTaskRunId: number;

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
      async onTaskExecutionStart() {
        assertMandatoryIds();
        fileTaskRunId = await taskRunService.initTaskRun({
          file_task_id: fileTaskId,
          file_task_version_id: fileTaskVersionId,
        });
      },
      async onTaskCodeLoaded() {
        // console.log("Task code loaded");
      },
      async onTaskExportsLoaded() {
        // console.log("Task exports loaded");
      },
    };

    const runtimeCallbacks: TaskRuntimeCallbacks = {
      async onNotFound() {
        assertMandatoryIds();
        await logService.logError(fileTaskId, fileTaskRunId, "Task not found");
        logTaskCallback(
          `Task not found: ${fileTaskId}, run ID: ${fileTaskRunId}`
        );
      },
      async onSkip() {
        assertMandatoryIds();
        await taskRunService.skipTaskRun(fileTaskRunId);
        await logService.logInfo(fileTaskId, fileTaskRunId, "Task skipped");
        logTaskCallback(
          `Task skipped: ${fileTaskId}, run ID: ${fileTaskRunId}`
        );
      },
      async onStart() {
        assertMandatoryIds();
        await taskRunService.startTaskRun(fileTaskRunId);
        await logService.logInfo(fileTaskId, fileTaskRunId, "Task started");
        logTaskCallback(
          `Task started: ${fileTaskId}, run ID: ${fileTaskRunId}`
        );
      },
      async onFailure() {
        assertMandatoryIds();
        await taskRunService.endTaskRun(fileTaskRunId, "failure");
        await logService.logError(fileTaskId, fileTaskRunId, "Task failed");
        logTaskCallback(`Task failed: ${fileTaskId}, run ID: ${fileTaskRunId}`);
      },
      async onSuccess() {
        assertMandatoryIds();
        await taskRunService.endTaskRun(fileTaskRunId, "success");
        await logService.logInfo(fileTaskId, fileTaskRunId, "Task succeeded");
        logTaskCallback(
          `Task succeeded: ${fileTaskId}, run ID: ${fileTaskRunId}`
        );
      },
    };

    return {
      compiledPath,
      sourcePath,
      taskCallbacks: taskCallbacks,
      runtimeCallbacks: runtimeCallbacks,
      env,
      $: {
        // Logging
        async logInfo(value) {
          logTaskConsoleInfo(value);
          await logService.logInfo(fileTaskId, fileTaskRunId, value);
        },
        async logError(value) {
          logTaskConsoleError(value);
          await logService.logError(fileTaskId, fileTaskRunId, value);
        },
        async logWarning(value) {
          logTaskConsoleWarn(value);
          await logService.logWarning(fileTaskId, fileTaskRunId, value);
        },
        // KV
        async setItem(key, value) {
          await kvService.setValue(fileTaskId, key, value);
        },
        async getItem(key) {
          return kvService.getValue(fileTaskId, key);
        },
        async deleteItem(key) {
          await kvService.deleteValue(fileTaskId, key);
        },
        // Timing
        startTimer(label) {
          return timingService.start(fileTaskId, fileTaskRunId, label);
        },
      },
    };
  };

  return generateControls;
}
