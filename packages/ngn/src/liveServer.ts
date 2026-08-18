/**
 * The one server `ngn` still runs, and the only thing it does is execute code.
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

export const LIVE_HOST = "127.0.0.1";

export type ExecuteLiveTask = (
  code: string,
  language: "typescript" | "javascript"
) => Promise<unknown>;

const liveTaskSchema = z.object({
  code: z.string(),
  language: z.enum(["typescript", "javascript"]),
});

export interface LiveServerOptions {
  port: number;
  version: string;
  executeLiveTask: ExecuteLiveTask;
}

export async function runLiveServer(options: LiveServerOptions) {
  const app = new Hono();
  const api = new Hono();

  // ngnui probes this to decide whether to enable its live editor.
  api.get("/meta", (c) =>
    c.json({ runtime: "ngn", version: options.version, live: true })
  );

  api.post("/live", async (c) => {
    const parsed = liveTaskSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "expected { code, language }" }, 400);
    }

    const result = await options.executeLiveTask(
      parsed.data.code,
      parsed.data.language
    );

    try {
      return c.json({ result: result ?? null });
    } catch {
      console.error("Live code execution result not serializable", result);
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
        `❌ Port ${options.port} is already in use. Set \`port\` in ngn.config.ts to a free one.`
      );
      process.exit(1);
    }
    console.error("❌ Live server error:", err);
    process.exit(1);
  });

  return server;
}
