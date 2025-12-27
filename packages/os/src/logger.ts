import debug from "debug";

const loggers = {
  TASK_LIBRARY_SCHEDULER: "taskLibScheduler:log",
  TASK_LIBRARY_SCHEDULER_ERROR: "taskLibScheduler:error",
  TASK_ONCE_RUNNER: "taskOnceRunner:log",
  TASK_ONCE_RUNNER_ERROR: "taskOnceRunner:error",
  TASK_CALLBACK: "task:CB",
  TASK_CONSOLE_INFO: "task:console:info",
  TASK_CONSOLE_WARN: "task:console:warn",
  TASK_CONSOLE_ERROR: "task:console:error",
} as const;

export const logTaskLibraryScheduler = debug(loggers.TASK_LIBRARY_SCHEDULER);
export const logTaskLibrarySchedulerError = debug(
  loggers.TASK_LIBRARY_SCHEDULER_ERROR
);
export const logTaskCallback = debug(loggers.TASK_CALLBACK);
export const logTaskConsoleInfo = debug(loggers.TASK_CONSOLE_INFO);
export const logTaskOnceRunner = debug(loggers.TASK_ONCE_RUNNER);
export const logTaskOnceRunnerError = debug(loggers.TASK_ONCE_RUNNER_ERROR);
export const logTaskConsoleWarn = debug(loggers.TASK_CONSOLE_WARN);
export const logTaskConsoleError = debug(loggers.TASK_CONSOLE_ERROR);
