import { basename, join, isAbsolute } from "node:path";
import { sanitizeUnsafeRegExp } from "../util.js";

export function getExtension(path: string) {
  return path.split(".").pop();
}

// 'file.with.long.extension' => '.with.long.extension'
export function getFilenameExtLong(path: string) {
  const filename = basename(path);
  return filename.substring(filename.indexOf("."));
}

// 'file.with.long.extension' => 'file.with.long'
export function clearExtensionShort(path: string) {
  const ext = getExtension(path);
  if (!ext) {
    return path;
  }

  return path.substring(0, path.length - ext.length - 1);
}

// remove extension like '.ext' or '.ext.ext'
export function clearExtensionLong(path: string) {
  const ext = getFilenameExtLong(path);
  if (!ext) {
    return path;
  }

  return path.substring(0, path.length - ext.length);
}

export function getFilename(path: string, extToStrip?: string) {
  if (!extToStrip) {
    return basename(path);
  }

  return basename(path, extToStrip);
}

export function replaceExtension(path: string, oldExtension: string, newExtension: string) {
  const old = sanitizeUnsafeRegExp(oldExtension);

  return path.replace(new RegExp(`${old}$`), newExtension);
}

export function getCwd(cwd: string, rootDir?: string): string {
  const normalizedPath = rootDir ?? cwd;

  return isAbsolute(normalizedPath) ? normalizedPath : join(cwd, normalizedPath);
}

export function absOrJoinWithRoot(path: string, rootDirAbsPath: string): string {
  return isAbsolute(path) ? path : join(rootDirAbsPath, path);
}

/**
 * Strips the absolute base path from the given path.
 * Example:
 * - absBasePath: "/home/user/projects/my-project"
 * - path: "/home/user/projects/my-project/src/index.ts"
 * Returns: "src/index.ts"
 * @param path The path to strip the base path from.
 * @param absBasePath The absolute base path to strip.
 * @returns The stripped path.
 */
export function stripAbsBasePath(path: string, absBasePath: string): string {
  if (!absBasePath || !path) {
    return path;
  }

  const normalizedBasePath = absBasePath.endsWith("/") ? absBasePath.slice(0, -1) : absBasePath;

  return path.replace(normalizedBasePath + "/", "");
}

/*
 * Extracts source directories from glob patterns like ["tasks/**\/*.ts"]
 */
export function extractSourceDirsFromGlobs(globs: string[]): string[] {
  return globs.map((glob) => {
    const parts = glob.split("/");

    const firstIndexWithGlob = parts.findIndex((part) => part.includes("*"));

    if (firstIndexWithGlob === -1) {
      return glob; // No glob pattern found, return as is
    }
    // If a glob pattern was found, return the directory path up to that point
    return parts.slice(0, firstIndexWithGlob).join("/");
  });
}
