export { Compiler } from "./source/compiler.js";
export { executeEsm } from "./runtime/vm.js";
export { Task } from "./runtime/task.js";
export { TaskLibrary } from "./runtime/taskLibrary.js";
export { TaskLibraryScheduler } from "./runtime/taskLibraryScheduler.js";
export { TaskOnceRunner } from "./runtime/taskOnceRunner.js";
export { setupDbClient, getDbClient } from "./db/db.js";
export { initDbFileIfNotExists } from "./db/db.js";
export { createControlsGenerator } from "./runtime/generateControls.js";
export { TaskContext } from "./source/types.js";

// Per-task SQLite, injected as ctx.sqlite
export { closeTaskDatabases } from "./runtime/taskSqlite.js";
export type { TaskSqlite, DBInstance, InitDBOptions, Migration } from "./runtime/taskSqlite.js";
