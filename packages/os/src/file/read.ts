import { isAbsolute, normalize } from "node:path";
import { readFile, stat, access, constants as fsConstants } from "node:fs/promises";
import { parse } from "dotenv";

export async function isDirectory(path: string) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// stat vs. lstat
// export async function isDirectory(path: string) {
//   const stat = await lstat(path);
//   return stat.isDirectory();
// }

export async function isFile(path: string) {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function checkFileReadable(path: string) {
  const cleanPath = normalize(path);

  try {
    await access(cleanPath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// env
async function parseEnvFile(path: string) {
  const fileExists = await isFile(path);

  if (!fileExists) {
    return null;
  }

  try {
    const fileContents = await readFile(path, "utf-8");
    return parse(fileContents);
  } catch {
    return null;
  }
}

export async function readEnv(path: string) {
  if (!path) {
    return null;
  }

  if (isAbsolute(path)) {
    return parseEnvFile(path);
  }

  return null;
}

// other files
export async function readFileAsUtf8(absFilePath: string) {
  return readFile(absFilePath, "utf-8");
}
