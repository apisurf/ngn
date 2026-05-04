export { handleSigInt, handleSigTerm } from "./process.js";

export { FsNodeFileDescriptor } from "./file/types/FsNodeDescriptor.js";
export { createFileDescriptor } from "./file/createFileDescriptor.js";
export { FsDirWatcher } from "./file/fsWatcher.js";
export { isDirectory, isFile, readEnv, readFileAsUtf8 } from "./file/read.js";
export { writeFileAsUtf8 } from "./file/write.js";
export {
  getFilename,
  getExtension,
  replaceExtension,
  clearExtensionLong,
  clearExtensionShort,
  absOrJoinWithRoot,
  getCwd,
  stripAbsBasePath,
  extractSourceDirsFromGlobs,
} from "./file/path.js";
export * from "./logger.js";
