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
import type { ScheduleCommand, ScheduleControlResult } from "@apisurf/ngn-core";
import type { LiveTaskOutcome } from "./util/runLiveTask.js";

export const LIVE_HOST = "127.0.0.1";

export type ExecuteLiveTask = (
  code: string,
  language: "typescript" | "javascript",
) => Promise<LiveTaskOutcome>;

/** Start a run of one scheduled task now, by its project-relative path. */
export type RunTaskNow = (
  path: string,
) => Promise<{ started: true } | { started: false; reason: string }>;

const runTaskSchema = z.object({ path: z.string().min(1) });

/** Pause, resume or move one scheduled task, as `ngn pause`, `resume` and `next` do. */
export type ControlTask = (
  path: string,
  command: ScheduleCommand,
) => Promise<ScheduleControlResult>;

const controlSchema = z.object({
  path: z.string().min(1),
  command: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pause") }),
    z.object({ kind: z.literal("resume") }),
    z.object({ kind: z.literal("next"), delayMs: z.number().int().min(0) }),
  ]),
});

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
  controlTask: ControlTask;
}

export async function runLiveServer(options: LiveServerOptions) {
  const app = new Hono();
  const api = new Hono();

  // ngnui probes this to decide whether to enable its editor and Run now. `db`
  // lets an ngnui that found this port in a config check it is the same
  // project; `run` says this runtime can start a task's run on request, and
  // `schedule` that it can pause, resume and move one.
  api.get("/meta", (c) =>
    c.json({
      runtime: "ngn",
      version: options.version,
      live: true,
      run: true,
      schedule: true,
      db: options.db,
    }),
  );

  // The same transitions as `ngn pause`, `resume` and `next`, with source `cli`.
  api.post("/schedule", async (c) => {
    const parsed = controlSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "expected { path, command }" }, 400);
    const result = await options.controlTask(parsed.data.path, parsed.data.command);
    if (result.applied)
      return c.json({ applied: true, event: result.event, message: result.message });
    return result.error
      ? c.json({ error: result.message }, 409)
      : c.json({ applied: false, message: result.message });
  });

  // Answers once the run is under way: it is recorded like any other, and
  // ngnui reads how it went from the database.
  api.post("/run", async (c) => {
    const parsed = runTaskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "expected { path }" }, 400);
    const outcome = await options.runTaskNow(parsed.data.path);
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
