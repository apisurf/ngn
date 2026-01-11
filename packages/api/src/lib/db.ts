import type { Client, InValue } from "ngn-persistence";
import type { DbPath } from "ngn-persistence";
import {
  safeInitDbClient,
  strictInitDbClientFromFilePath,
} from "ngn-persistence";

let db: Client;

export async function getDbClient(path: DbPath) {
  if (db) {
    return db;
  }

  if (path === ":memory:") {
    db = await safeInitDbClient(path);
  } else {
    db = await strictInitDbClientFromFilePath(path);
  }

  return db;
}

export const stripUndefinedArgs = (
  obj: Record<string, InValue | undefined>
): Record<string, InValue> => {
  Object.keys(obj).forEach((key) => {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  });

  return obj as Record<string, InValue>;
};
