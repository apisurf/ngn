#!/usr/bin/env node
/**
 * ngnui — browse an ngn run database in your browser.
 *
 *   ngnui                         the dbPath from ./ngn.config.ts on http://127.0.0.1:3000
 *   ngnui --db ~/work/ngn.sqlite --port 4000
 *   ngnui --db ./ngn.sqlite --live http://127.0.0.1:4545
 *
 * The whole command is: start the prebuilt viewer against one file and print
 * the link. It binds to the loopback interface only and opens the database
 * read-only, so it can neither be reached from the network nor modify what it
 * is showing. It stays in the foreground until Ctrl-C.
 *
 * The one thing it does besides reading is the live task editor, and that it
 * does not do itself: code typed there is forwarded to the `--live` endpoint of
 * a running `ngn run`, which is the only process with a compiler, config and
 * env to execute it with. Without `--live` the editor stays disabled.
 */
import { existsSync, readFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

/** Loopback only. A run database holds task output, logs and stored values. */
const HOST = "127.0.0.1";
const DEFAULT_DB = "ngn.sqlite";
const DEFAULT_PORT = 3000;
/** How far above the default port to look when it is taken. */
const PORT_SCAN = 20;
const CONFIG_FILES = ["ngn.config.ts", "ngn.config.js"];

const SERVER_ENTRY = new URL("../dist/server/index.mjs", import.meta.url);
const MANIFEST = new URL("../package.json", import.meta.url);

/**
 * One command, so one page — but it leads with the fact that costs the most to
 * learn the hard way: this process does not exit. Anything reading the help to
 * decide whether to run it needs that in the first screenful, along with where
 * to go instead when a browser is not an option.
 */
const USAGE = `ngnui — browse an ngn run database in your browser.

Usage
  ngnui [options]

Serves a prebuilt web UI over one ngn database: every task and its runs, each
run's logs and timings on one timeline, the keys a task stored, the versions
of its code, plus a read-only SQL console. Binds to 127.0.0.1 only and opens
the database read-only, so it is unreachable from the network and cannot
change what it is showing.

Interactive: this command does not exit. It prints a URL and holds the terminal
until Ctrl-C. To read the database programmatically, use \`ngn sql\` instead —
same file, and it prints rows and exits.

Options
  --db <path>     Database file to read. Default: dbPath from ./ngn.config.ts,
                  else ./${DEFAULT_DB}
  --live <url>    A running \`ngn run\` to send the live editor's code to, e.g.
                  http://127.0.0.1:4545. Without it the editor is disabled
  --port <n>      Port to serve on. Default ${DEFAULT_PORT}. Without --port, the next free
                  port up to ${DEFAULT_PORT + PORT_SCAN} is used instead of failing
  -h, --help      Show this help
  -v, --version   Show the version

Examples
  ngnui
  ngnui --db ~/work/ngn.sqlite
  ngnui --db ./ngn.sqlite --live http://127.0.0.1:4545 --port 4000

Notes
  \`ngn run\` prints the exact ngnui command for its project when it starts.
  A missing database is not an error — the UI starts empty and fills in.
  Read-only, so leaving it open while tasks run is fine; toggle Live to follow it.
`;

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        db: { type: "string" },
        live: { type: "string" },
        port: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    // Point at the page rather than reprinting it under an error.
    process.stderr.write(`ngnui: ${message(err)}\nRun ngnui --help for the options it takes.\n`);
    return 1;
  }

  if (parsed.values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.values.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  if (!existsSync(SERVER_ENTRY)) {
    process.stderr.write(
      "ngnui: this install has no prebuilt UI in dist/. " +
        "From a checkout, run `pnpm --filter @apisurf/ngnui build` first.\n",
    );
    return 1;
  }

  const dbPath = databasePath(parsed.values.db);
  if (dbPath === null) return 1;
  if (!existsSync(dbPath)) {
    // Not fatal: the UI renders an empty state, and starting it before the
    // first run is a normal thing to do. Say so rather than fail.
    const empty = "the UI will be empty until `ngn run` writes to it";
    process.stderr.write(`ngnui: no database at ${dbPath} yet — ${empty}.\n`);
  }

  const live = liveUrl(parsed.values.live);
  if (live === null) return 1;

  const wanted = port(parsed.values.port);
  if (wanted === null) return 1;

  const listening = await freePort(wanted, parsed.values.port === undefined ? PORT_SCAN : 0);
  if (listening === null) {
    process.stderr.write(
      parsed.values.port === undefined
        ? `ngnui: ports ${wanted}-${wanted + PORT_SCAN} are all in use. ` +
            "Pass --port <n> to pick one.\n"
        : `ngnui: port ${wanted} is already in use.\n`,
    );
    return 1;
  }

  process.env.NGN_DB = dbPath;
  if (live) process.env.NGN_LIVE = live;
  else delete process.env.NGN_LIVE;
  // NITRO_* wins over the plain names inside the server, so set both: an
  // inherited NITRO_PORT from some other project must not redirect this one.
  process.env.PORT = String(listening);
  process.env.NITRO_PORT = String(listening);
  process.env.HOST = HOST;
  process.env.NITRO_HOST = HOST;

  swallowServerBanner();
  await import(SERVER_ENTRY.href);
  await waitForServer(listening);

  const url = `http://${HOST}:${listening}`;
  process.stdout.write(
    `\n  ngnui\n\n` +
      `  open       ${url}\n` +
      `  database   ${dbPath}\n` +
      `  live       ${live ?? "off — pass --live <url of a running ngn run> to enable the editor"}\n\n` +
      `  Ctrl-C to stop.\n\n`,
  );

  // Nothing more to do here: the server holds the process open until Ctrl-C.
  return new Promise(() => {});
}

/**
 * Which file to read: `--db` if given, else what the project's config says,
 * else ./ngn.sqlite. Returns null (after reporting) when there is nothing that
 * could ever be read.
 */
function databasePath(raw) {
  if (raw !== undefined) {
    if (raw === ":memory:") {
      process.stderr.write("ngnui: --db :memory: has nothing to browse. Pass a file.\n");
      return null;
    }
    const path = raw.startsWith("file:") ? raw.slice(5) : raw;
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }

  const fromConfig = configDbPath(process.cwd());
  if (fromConfig === undefined) return resolve(process.cwd(), DEFAULT_DB);
  if (fromConfig.memory) {
    process.stderr.write(
      `ngnui: dbPath is :memory: in ${fromConfig.config}, so no run has left anything to browse.\n` +
        "       Set it to a file: URL, or pass --db <path>.\n",
    );
    return null;
  }
  return fromConfig.path;
}

/**
 * The `dbPath` an ngn.config.ts in `dir` sets, read as text.
 *
 * The config is TypeScript, and evaluating it takes the compiler `ngn` itself
 * carries. Nearly every config states dbPath as a string literal, so that is
 * what is read; one that computes it gets `undefined`, which falls back to the
 * default and is always overridable with --db. Relative paths resolve against
 * the config's folder, the project root `ngn run` is started from.
 */
function configDbPath(dir) {
  for (const name of CONFIG_FILES) {
    const config = join(dir, name);
    if (!existsSync(config)) continue;
    let source;
    try {
      source = readFileSync(config, "utf8");
    } catch {
      return undefined;
    }
    const match = /\bdbPath\s*:\s*(["'`])([^"'`]+)\1/.exec(source);
    // No dbPath at all is ngn's default, :memory:. One that is computed is unknown.
    if (!match) return /\bdbPath\b/.test(source) ? undefined : { config: name, memory: true };
    const value = match[2];
    if (value === ":memory:") return { config: name, memory: true };
    const path = value.startsWith("file:") ? value.slice(5) : value;
    return {
      config: name,
      memory: false,
      path: isAbsolute(path) ? path : resolve(dirname(config), path),
    };
  }
  return undefined;
}

/** Parse --live. Undefined when not given; null (after reporting) when unusable. */
function liveUrl(raw) {
  if (raw === undefined) return undefined;
  let url;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    process.stderr.write(
      `ngnui: --live expects the URL \`ngn run\` printed, e.g. http://127.0.0.1:4545 (got "${raw}")\n`,
    );
    return null;
  }
  return url.origin;
}

/** Parse --port. Returns null (after reporting) if it is not a usable port. */
function port(raw) {
  if (raw === undefined) return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    process.stderr.write(`ngnui: --port expects a number between 1 and 65535 (got "${raw}")\n`);
    return null;
  }
  return value;
}

/**
 * The first free port at or above `from`, or null if `span` more are all taken.
 *
 * Binding here and releasing it a moment before the server binds leaves a race
 * nothing can close, but it turns the common case — 3000 busy because another
 * dev server has it — from a stack trace into the UI simply opening on 3001.
 */
async function freePort(from, span) {
  for (let candidate = from; candidate <= from + span; candidate++) {
    if (await available(candidate)) return candidate;
  }
  return null;
}

function available(candidate) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(candidate, HOST, () => probe.close(() => done(true)));
  });
}

/** Resolve once the server accepts connections, or after `timeoutMs` either way. */
async function waitForServer(listening, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await new Promise((done) => {
      const socket = connect(listening, HOST);
      socket.once("connect", () => socket.end(() => done(true)));
      socket.once("error", () => done(false));
    });
    if (up) return;
    await new Promise((done) => setTimeout(done, 25));
  }
}

/**
 * Print one banner, ours.
 *
 * The server bundle logs its own "Listening on" line the moment the socket is
 * up. Ours says the same thing plus which file it is reading, so the first line
 * matching that is swallowed and the patch takes itself back off.
 */
function swallowServerBanner() {
  const log = console.log;
  console.log = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("Listening on:")) {
      console.log = log;
      return;
    }
    log(...args);
  };
}

function version() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function message(err) {
  return err instanceof Error ? err.message : String(err);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`ngnui: ${err instanceof Error ? (err.stack ?? err.message) : err}\n`);
    process.exitCode = 1;
  });
