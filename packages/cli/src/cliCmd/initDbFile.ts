import invariant from "tiny-invariant";
import { DbPath } from "op3-persistence";
import { initDbFileIfNotExists } from "op3-core";

export const initDbFile = async (dbPath: DbPath) => {
  invariant(dbPath, "dbPath is required");
  invariant(
    dbPath !== ":memory:",
    "dbPath must be file path and not ':memory:'"
  );

  if (!dbPath.startsWith("file:")) {
    dbPath = `file:${dbPath}`;
  }

  try {
    const path = await initDbFileIfNotExists(dbPath);
    console.log(`Database initialized at ${path}`);
  } catch (error) {
    console.error("Error initializing database file");
    console.error(error);
  }
};
