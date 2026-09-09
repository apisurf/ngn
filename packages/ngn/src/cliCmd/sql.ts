/**
 * `ngn sql` — read a task database from the terminal.
 *
 * This is a pass-through by design: whatever SQLite accepts, this accepts.
 * There is no allowlist and no injection surface to defend — the query comes
 * from the person who owns the file, on their own machine. Nothing here runs a
 * migration, so querying can never change the shape of the file.
 *
 * Rows go to stdout and everything else (counts, timings, errors) to stderr,
 * so `ngn sql "..." --json | jq` works without filtering out chatter.
 */
import { existsSync } from "node:fs";
import { getCwd } from "@apisurf/ngn-os";
import { openDbClient } from "@apisurf/ngn-persistence";
import { findConfigFile, readConfig } from "../config.js";
import { describeDbPath } from "../util/dbPath.js";
import { type Row, formatMs, renderCsv, renderJson, renderTable } from "../util/format.js";

export interface SqlOptions {
  db?: string;
  root?: string;
  json?: boolean;
  csv?: boolean;
  maxWidth?: string;
}

export const sql = async (query: string, options: SqlOptions) => {
  const dbPath = await resolveDbPath(options);
  if (dbPath === null) return fail();

  // Read-only session against a file a task may be writing right now: take the
  // busy timeout, but leave the journal mode of someone else's file alone.
  const client = openDbClient(`file:${dbPath}`, { wal: false });
  const started = performance.now();

  try {
    const result = await client.execute(query);
    const elapsed = performance.now() - started;

    // No columns means the statement was an INSERT/UPDATE/DDL rather than a
    // read, and the interesting number is what it changed.
    if (result.columns.length === 0) {
      const n = result.rowsAffected;
      process.stderr.write(`${n} row${n === 1 ? "" : "s"} changed (${formatMs(elapsed)})\n`);
      return;
    }

    const columns = [...result.columns];
    const rows: Row[] = result.rows.map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, normalize(row[index])])),
    );

    if (options.json) {
      process.stdout.write(`${renderJson(rows)}\n`);
      return;
    }

    if (options.csv) {
      if (rows.length > 0) process.stdout.write(`${renderCsv(rows, columns)}\n`);
      return;
    }

    if (rows.length === 0) {
      process.stderr.write(`no rows (${formatMs(elapsed)})\n`);
      return;
    }

    const maxColumnWidth = options.maxWidth === undefined ? 60 : Number(options.maxWidth);
    if (!Number.isFinite(maxColumnWidth) || maxColumnWidth < 0) {
      process.stderr.write(
        `ngn: --max-width expects a non-negative number (got "${options.maxWidth}")\n`,
      );
      return fail();
    }

    process.stdout.write(`${renderTable(rows, columns, { maxColumnWidth })}\n`);
    process.stderr.write(
      `\n${rows.length} row${rows.length === 1 ? "" : "s"} (${formatMs(elapsed)})\n`,
    );
  } catch (error) {
    // Multi-statement input: execute() rejects it, executeMultiple() accepts
    // it. Try that before reporting a failure, so pasting a couple of
    // statements at once does the obvious thing.
    if (isMultiStatement(error)) {
      try {
        await client.executeMultiple(query);
        process.stderr.write(`ok (${formatMs(performance.now() - started)})\n`);
        return;
      } catch (multiError) {
        report(multiError);
        return fail();
      }
    }
    report(error);
    return fail();
  } finally {
    client.close();
  }
};

/**
 * Which file to open: `--db` if given, otherwise whatever ngn.config.ts says.
 *
 * Reading the config is what makes the command usable without arguments in a
 * project directory, and it is also the only place that knows a project is
 * configured for `:memory:` — a case worth naming, because the query would
 * otherwise succeed against an empty database and report "no rows".
 *
 * Returns null after reporting why there is nothing to open.
 */
async function resolveDbPath(options: SqlOptions): Promise<string | null> {
  if (options.db) {
    const described = describeDbPath(options.db);
    if (described.isMemory) {
      process.stderr.write("ngn: --db :memory: has nothing to query.\n");
      return null;
    }
    if (!existsSync(described.absolute as string)) {
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

  if (!existsSync(described.absolute as string)) {
    process.stderr.write(
      `ngn: no database at ${described.absolute} yet — it is created by the first \`ngn run\`.\n`,
    );
    return null;
  }

  return described.absolute;
}

/** libsql hands blobs back as ArrayBuffer; the formatters speak Uint8Array. */
function normalize(value: unknown): unknown {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

function isMultiStatement(error: unknown): boolean {
  return message(error).toLowerCase().includes("more than one statement");
}

function report(error: unknown) {
  process.stderr.write(`ngn: ${message(error)}\n`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail() {
  process.exitCode = 1;
}
