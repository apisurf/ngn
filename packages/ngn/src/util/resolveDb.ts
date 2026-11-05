/** Which run database a reading command opens: `--db`, else the project config's `dbPath`. */
import { existsSync } from "node:fs";
import { getCwd } from "@apisurf/ngn-os";
import { findConfigFile, readConfig } from "../config.js";
import { describeDbPath } from "./dbPath.js";

/**
 * Which file to open: `--db` if given, otherwise whatever ngn.config.ts says.
 *
 * Reading the config is what makes the command usable without arguments in a
 * project directory, and it is also the only place that knows a project is
 * configured for `:memory:` — a case worth naming, because the query would
 * otherwise succeed against an empty database and report "no rows".
 *
 * Returns null after reporting why there is nothing to open. A file that does
 * not exist yet only counts as nothing when `mustExist`: a viewer can start
 * before the first run, a query cannot.
 */
export async function resolveDbPath(
  options: { db?: string; root?: string },
  { mustExist }: { mustExist: boolean },
): Promise<string | null> {
  if (options.db) {
    const described = describeDbPath(options.db);
    if (described.isMemory) {
      process.stderr.write("ngn: --db :memory: has nothing to query.\n");
      return null;
    }
    if (mustExist && !existsSync(described.absolute as string)) {
      process.stderr.write(`ngn: no database at ${described.absolute}\n`);
      return null;
    }
    return described.absolute;
  }

  const rootDir = getCwd(process.cwd(), options.root);
  const configPath = findConfigFile(rootDir);
  if (!configPath) {
    process.stderr.write(
      `ngn: no ngn.config.ts in ${rootDir}. Pass --db <path> to query a database directly.\n`,
    );
    return null;
  }

  const config = await readConfig(configPath);
  const described = describeDbPath(config.dbPath, rootDir);

  if (described.isMemory) {
    process.stderr.write(
      "ngn: dbPath is :memory: in ngn.config.ts, so no run has left anything to query.\n" +
        "     Set it to a file: URL, or pass --db <path>.\n",
    );
    return null;
  }

  if (mustExist && !existsSync(described.absolute as string)) {
    process.stderr.write(
      `ngn: no database at ${described.absolute} yet — it is created by the first \`ngn run\`.\n`,
    );
    return null;
  }

  return described.absolute;
}
