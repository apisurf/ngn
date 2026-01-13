export { Compiler } from "./source/compiler.js";
export { executeEsm } from "./runtime/vm.js";
export { Task } from "./runtime/task.js";
export { TaskLibrary } from "./runtime/taskLibrary.js";
export { TaskLibraryScheduler } from "./runtime/taskLibraryScheduler.js";
export { TaskOnceRunner } from "./runtime/taskOnceRunner.js";
export { setupDbClient, getDbClient } from "./db/db.js";
export { initDbFileIfNotExists } from "./db/db.js";
export { createControlsGenerator } from "./runtime/generateControls.js";
export { TaskContext, BaseTaskContext } from "./source/types.js";

// Plugin system exports
export { PluginManager } from "./plugin/manager.js";
export { definePlugin } from "./plugin/types.js";
export type { Plugin, PluginApi, PluginsToApiMap } from "./plugin/types.js";
