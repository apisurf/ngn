#!/usr/bin/env node
/**
 * ngnui — browse an ngn database in your browser.
 *
 *   ngnui                          ./ngn.sqlite on http://127.0.0.1:3000
 *   ngnui --db ~/work/ngn.sqlite --port 4000
 *
 * The whole command is: start the prebuilt viewer against one file and print
 * the link. It binds to the loopback interface only and opens the database
 * without migrations, so it can neither be reached from the network nor modify
 * what it is showing. It stays in the foreground until Ctrl-C.
 */
import { existsSync, readFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";

/** Loopback only. A task database is full of real logs and real payloads. */
const HOST = "127.0.0.1";
const DEFAULT_DB = "ngn.sqlite";
const DEFAULT_PORT = 3000;
/** How far above the default port to look when it is taken. */
const PORT_SCAN = 20;

const SERVER_ENTRY = new URL("../dist/server.js", import.meta.url);
const MANIFEST = new URL("../package.json", import.meta.url);

/**
 * One command, so one page — but it leads with the fact that costs the most to
 * learn the hard way: this process does not exit. Anything reading the help to
 * decide whether to run it needs that in the first screenful, along with where
 * to go instead when a browser is not an option.
 */
const USAGE = `ngnui — browse an ngn task database in your browser.

Usage
  ngnui [options]

Serves a prebuilt web UI over one database: tasks, runs, logs, timings and the
dashboard. Binds to 127.0.0.1 only and opens the database without migrating it,
so it is unreachable from the network and cannot change what it is showing.

Interactive: this command does not exit. It prints a URL and holds the terminal
until Ctrl-C. To read a database programmatically, use \`ngn sql\` instead —
same file, and it prints rows and exits.

Options
  --db <path>     Database file to read. Default ./ngn.sqlite
  --port <n>      Port to serve on. Default 3000. Without --port, the next free
                  port up to ${DEFAULT_PORT + PORT_SCAN} is used instead of failing
  --live <url>    Base URL of a running \`ngn run\` to forward the live editor to,
                  e.g. http://127.0.0.1:4545. Without it the live page is
                  disabled — ngnui reads a file and cannot execute tasks
  -h, --help      Show this help
  -v, --version   Show the version

Examples
  ngnui
  ngnui --db ~/work/jobs/ngn.sqlite
  ngnui --db ./ngn.sqlite --port 4000 --live http://127.0.0.1:4545

Notes
  The database is written by \`ngn run\` — set dbPath in ngn.config.ts to a
  file: URL, since the default (:memory:) leaves nothing to browse.
  A missing database is not an error — the UI starts empty and fills in.
  Read-only, so leaving it open during a run is fine; refresh for new runs.
`;

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        db: { type: "string" },
        port: { type: "string" },
        live: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    // Point at the page rather than reprinting it under an error.
    process.stderr.write(
      `ngnui: ${message(err)}\nRun ngnui --help for the options it takes.\n`
    );
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
        "From a checkout, run `pnpm --filter @apisurf/ngnui build` first.\n"
    );
    return 1;
  }

  const raw = stripFileScheme(parsed.values.db ?? DEFAULT_DB);
  const dbPath = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  if (!existsSync(dbPath)) {
    // Not fatal: the UI renders an empty state, and starting it before the
    // first run is a normal thing to do. Say so rather than fail.
    process.stderr.write(
      `ngnui: no database at ${dbPath} yet — the UI will be empty until a run writes to it.\n`
    );
  }

  const liveUrl = live(parsed.values.live);
  if (liveUrl === false) return 1;

  const wanted = port(parsed.values.port);
  if (wanted === null) return 1;

  const listening = await freePort(
    wanted,
    parsed.values.port === undefined ? PORT_SCAN : 0
  );
  if (listening === null) {
    process.stderr.write(
      parsed.values.port === undefined
        ? `ngnui: ports ${wanted}-${wanted + PORT_SCAN} are all in use. ` +
            "Pass --port <n> to pick one.\n"
        : `ngnui: port ${wanted} is already in use.\n`
    );
    return 1;
  }

  process.env.NGN_UI_DB = dbPath;
  process.env.NGN_UI_PORT = String(listening);
  process.env.NGN_UI_HOST = HOST;
  process.env.NGN_UI_VERSION = version();
  if (liveUrl) process.env.NGN_UI_LIVE_URL = liveUrl;

  await import(SERVER_ENTRY.href);
  await waitForServer(listening);

  const url = `http://${HOST}:${listening}`;
  process.stdout.write(
    `\n  ngn ui\n\n` +
      `  open       ${url}\n` +
      `  database   ${dbPath}\n` +
      (liveUrl ? `  live       ${liveUrl}\n` : "") +
      `\n  Ctrl-C to stop.\n\n`
  );

  // Nothing more to do here: the server holds the process open until Ctrl-C.
  return new Promise(() => {});
}

/** `file:./ngn.sqlite` is what ngn.config.ts holds; accept it as a path too. */
function stripFileScheme(value) {
  return value.startsWith("file:") ? value.slice(5) : value;
}

/** Parse --port. Returns null (after reporting) if it is not a usable port. */
function port(raw) {
  if (raw === undefined) return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    process.stderr.write(
      `ngnui: --port expects a number between 1 and 65535 (got "${raw}")\n`
    );
    return null;
  }
  return value;
}

/** Parse --live. Returns null when absent, or false (after reporting) if invalid. */
function live(raw) {
  if (raw === undefined) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return raw;
  } catch {
    process.stderr.write(
      `ngnui: --live expects a URL like http://127.0.0.1:4545 (got "${raw}")\n`
    );
    return false;
  }
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
    process.stderr.write(
      `ngnui: ${err instanceof Error ? (err.stack ?? err.message) : err}\n`
    );
    process.exitCode = 1;
  });
