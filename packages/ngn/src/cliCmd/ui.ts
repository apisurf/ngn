/**
 * `ngn ui [run]` — open the dashboard on this project.
 *
 * ngnui is its own package, so this finds one to start: the project's own
 * install, then one on PATH, then npx. It starts it in the project folder with
 * the database already chosen, which is also where ngnui looks for the runtime
 * port, so the editor connects whenever an `ngn run` is up. With a run id, the
 * browser opens on that run.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { getCwd } from "@apisurf/ngn-os";
import { openDbClient } from "@apisurf/ngn-persistence";
import { resolveDbPath } from "../util/resolveDb.js";

export interface UiOptions {
  root?: string;
  db?: string;
  port?: string;
  /** False with --no-open. */
  open: boolean;
}

export interface Launcher {
  /** What to run, and with which leading arguments. */
  command: string;
  args: string[];
  /** Said before starting, so nobody wonders where the UI came from. */
  source: string;
}

/** The first ngnui there is: the project's own, then PATH, then npx. */
export function findNgnui(
  rootDir: string,
  { onPath = isOnPath }: { onPath?: (bin: string) => boolean } = {},
): Launcher {
  // Walked by hand rather than through require.resolve, which also honours
  // NODE_PATH and would find an ngnui that is not this project's.
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const bin = join(dir, "node_modules", "@apisurf", "ngnui", "bin", "ngnui.mjs");
    if (existsSync(bin)) {
      return { command: process.execPath, args: [bin], source: "the project's @apisurf/ngnui" };
    }
    if (dirname(dir) === dir) break;
  }
  if (onPath("ngnui")) return { command: "ngnui", args: [], source: "ngnui on PATH" };
  return {
    command: "npx",
    args: ["--yes", "@apisurf/ngnui"],
    source: "npx @apisurf/ngnui (npm install -g @apisurf/ngnui to skip the download)",
  };
}

function isOnPath(bin: string): boolean {
  const names = process.platform === "win32" ? [`${bin}.cmd`, `${bin}.exe`] : [bin];
  return (process.env.PATH ?? "")
    .split(delimiter)
    .some((dir) => dir && names.some((name) => existsSync(join(dir, name))));
}

/** Ctrl-C is the child's to handle; this process only waits for it to exit. */
const ignore = () => {};

/** ngnui's readout says where it is serving: `  open       http://127.0.0.1:3000`. */
export function servedUrl(line: string): string | null {
  return /^\s*open\s+(https?:\/\/\S+)/.exec(line)?.[1] ?? null;
}

export const ui = async (runArg: string | undefined, options: UiOptions) => {
  const rootDir = getCwd(process.cwd(), options.root);
  const dbPath = await resolveDbPath({ db: options.db, root: options.root }, { mustExist: false });
  if (dbPath === null) {
    process.exitCode = 1;
    return;
  }

  const runId = runArg === undefined ? null : await checkRun(dbPath, runArg);
  if (runId === false) {
    process.exitCode = 1;
    return;
  }

  const launcher = findNgnui(rootDir);
  process.stderr.write(`ngn: starting ${launcher.source}\n`);
  const args = [
    ...launcher.args,
    "--db",
    dbPath,
    ...(options.port ? ["--port", options.port] : []),
  ];
  const child = spawn(launcher.command, args, {
    cwd: rootDir,
    stdio: ["inherit", "pipe", "inherit"],
  });

  let opened = false;
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    if (opened || !options.open) return;
    for (const line of chunk.toString("utf8").split("\n")) {
      const url = servedUrl(line);
      if (!url) continue;
      opened = true;
      openBrowser(runId == null ? url : `${url}/runs/${runId}`);
      break;
    }
  });

  // Ctrl-C reaches the child through the terminal; this process waits for it.
  // Anything else that stops this process is passed on, so no ngnui is left
  // serving with nobody to stop it.
  process.on("SIGINT", ignore);
  for (const signal of ["SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => {
    process.stderr.write(`ngn: could not start ngnui: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.off("SIGINT", ignore);
    process.exitCode = code ?? (signal ? 0 : 1);
  });
};

/** The run id when the file has that run; false (after reporting) when it does not. */
async function checkRun(dbPath: string, raw: string): Promise<number | false> {
  const id = Number(raw.replace(/^#/, ""));
  if (!Number.isInteger(id) || id <= 0) {
    process.stderr.write(`ngn: "${raw}" is not a run id\n`);
    return false;
  }
  if (!existsSync(dbPath)) {
    process.stderr.write(`ngn: no database at ${dbPath} yet, so there is no run ${id} to open\n`);
    return false;
  }
  const client = openDbClient(`file:${dbPath}`, { wal: false });
  try {
    const { rows } = await client.execute({
      sql: "SELECT 1 FROM task_runs WHERE id = ?",
      args: [id],
    });
    if (rows.length) return id;
    process.stderr.write(`ngn: there is no run ${id} in ${dbPath}\n`);
    return false;
  } finally {
    client.close();
  }
}

function openBrowser(url: string) {
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  const result = spawnSync(command!, args, { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    process.stderr.write(`ngn: open ${url} in a browser\n`);
  }
}
