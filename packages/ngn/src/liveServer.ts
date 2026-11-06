/**
 * The one server `ngn` still runs, and the only thing it does is execute code:
 * code sent from ngnui's editor, or one of the tasks this run schedules.
 *
 * Reading a database needs no scheduler — `ngn sql` opens the file, and so
 * does `ngnui`, which serves the whole web UI out of it. What neither can do
 * is run a task: that needs this project's compiler, config and env, which
 * exist only inside a live `ngn run`. So this endpoint stays here, next
 * to the runtime that can honour it, and ngnui forwards to it.
 *
 * It binds to the loopback interface. The payload is arbitrary code, executed
 * with this process's environment and credentials, so reaching it from another
 * machine must not be possible.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import type { LiveTaskOutcome } from "./util/runLiveTask.js";

export const LIVE_HOST = "127.0.0.1";

export type ExecuteLiveTask = (
  code: string,
  language: "typescript" | "javascript",
) => Promise<LiveTaskOutcome>;

/** Start a run of one scheduled task now, by its project-relative path. */
export type RunTaskNow = (path: string) => { started: true } | { started: false; reason: string };

const runTaskSchema = z.object({ path: z.string().min(1) });

const liveTaskSchema = z.object({
  code: z.string(),
  language: z.enum(["typescript", "javascript"]),
});

export interface LiveServerOptions {
  port: number;
  version: string;
  /** Absolute path of the run database, or null for :memory:. */
  db: string | null;
  executeLiveTask: ExecuteLiveTask;
  runTaskNow: RunTaskNow;
}

export async function runLiveServer(options: LiveServerOptions) {
  const app = new Hono();
  const api = new Hono();

  // ngnui probes this to decide whether to enable its editor and Run now. `db`
  // lets an ngnui that found this port in a config check it is the same
  // project; `run` says this runtime can start a task's run on request.
  api.get("/meta", (c) =>
    c.json({ runtime: "ngn", version: options.version, live: true, run: true, db: options.db }),
  );

  // Answers once the run is under way: it is recorded like any other, and
  // ngnui reads how it went from the database.
  api.post("/run", async (c) => {
    const parsed = runTaskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "expected { path }" }, 400);
    const outcome = options.runTaskNow(parsed.data.path);
    return outcome.started ? c.json({ started: true }) : c.json({ error: outcome.reason }, 409);
  });

  api.post("/live", async (c) => {
    const parsed = liveTaskSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "expected { code, language }" }, 400);
    }

    const outcome = await options.executeLiveTask(parsed.data.code, parsed.data.language);

    // A run that threw is an answer, not a broken endpoint: 200, with what it
    // threw, where, and the run it was recorded as.
    if (!outcome.ok) {
      const { error, stage, runId } = outcome;
      return c.json({ error: stage ? `failed in ${stage}: ${error}` : error, stage, runId });
    }

    try {
      return c.json({ result: outcome.result ?? null });
    } catch {
      console.error("Live code execution result not serializable", outcome.result);
      return c.json({ error: "Result is not serializable" }, 500);
    }
  });

  app.route("/api", api);

  const server = serve({
    fetch: app.fetch,
    port: options.port,
    hostname: LIVE_HOST,
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${options.port} is already in use. Set \`port\` in ngn.config.ts to a free one.`,
      );
      process.exit(1);
    }
    console.error("❌ Live server error:", err);
    process.exit(1);
  });

  return server;
}
