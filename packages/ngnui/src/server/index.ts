/**
 * The ngnui server: one process, one port, one database file.
 *
 * It answers `/api/*` out of the SQLite file it was pointed at and serves the
 * prebuilt client for everything else, so the page and its data share an
 * origin — no CORS, no second port, and nothing to configure in the browser.
 *
 * Everything it does with the database is a read. The one exception is
 * `/api/live`, which it cannot serve at all: running code needs the project's
 * config and env, which only a live `ngn run` has. That route is
 * forwarded to such a process when one is reachable and reported as
 * unavailable when it is not.
 */
import { serve } from "@hono/node-server";
import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { closeDbClient, dbExists, dbPath, getDbClient } from "./db.js";
import { liveRouter, probeLive } from "./live.js";
import { createRouter as createDashboardRouter } from "./routers/dashboard.js";
import { createRouter as createFileTasksRouter } from "./routers/fileTasks.js";
import { createRouter as createLogsRouter } from "./routers/logs.js";
import { createRouter as createTasksRunsRouter } from "./routers/taskRuns.js";
import { createRouter as createTimingsRouter } from "./routers/timings.js";
import { clientAsset, hasClient, indexHtml } from "./static.js";

export interface ServerOptions {
  port: number;
  host: string;
  /** Base URL of an `ngn run` process to forward live executions to. */
  liveUrl: string | null;
  version: string;
}

/**
 * A client that resolves per query instead of at boot.
 *
 * The database file is allowed not to exist yet — starting the UI before the
 * first `ngn run` is a reasonable thing to do — so routers cannot be handed a
 * connection when they are built. They only ever call `execute`, so one method
 * is the whole surface that has to be deferred.
 */
const lazyClient = {
  execute: (...args: Parameters<Client["execute"]>) => {
    const client = getDbClient();
    if (!client) throw new Error(`No database at ${dbPath()}`);
    return client.execute(...args);
  },
} as unknown as Client;

export function createApp(options: ServerOptions) {
  const app = new Hono();
  const api = new Hono();

  // What the client asks before it renders anything: which file is open, and
  // whether the live editor has a runtime to talk to.
  api.get("/meta", async (c) =>
    c.json({
      version: options.version,
      db: { path: dbPath(), exists: dbExists() },
      live: await probeLive(options.liveUrl),
    }),
  );

  api.route("/live", liveRouter(options.liveUrl));

  // Every data route needs the file. Answering once here beats each router
  // discovering the same missing table on its own, and it gives the page a
  // reason it can show rather than a stack of failed queries.
  const data = new Hono();
  data.use("*", async (c, next) => {
    if (!getDbClient()) {
      return c.json(
        {
          error: "database not found",
          detail: `No database at ${dbPath()}. It is created by the first \`ngn run\`.`,
        },
        503,
      );
    }
    return next();
  });

  data.route("/dashboard", createDashboardRouter(lazyClient));
  data.route("/file-tasks", createFileTasksRouter(lazyClient));
  data.route("/runs", createTasksRunsRouter(lazyClient));
  data.route("/logs", createLogsRouter(lazyClient));
  data.route("/timings", createTimingsRouter(lazyClient));

  api.route("/", data);
  app.route("/api", api);

  // Anything that is not the API is the single-page client: real files by
  // path, and index.html for every route the router owns.
  app.get("*", async (c) => {
    if (!hasClient()) {
      return c.text(
        "ngnui: no prebuilt client in dist/. Run `pnpm --filter @apisurf/ngnui build`.",
        500,
      );
    }

    const asset = await clientAsset(new URL(c.req.url).pathname);
    if (asset) {
      return c.body(asset.body, 200, {
        "Content-Type": asset.type,
        "Cache-Control": asset.immutable
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
    }

    const html = await indexHtml();
    return html === null
      ? c.text("ngnui: dist/client/index.html is missing.", 500)
      : c.html(html);
  });

  return app;
}

export function startServer(options: ServerOptions) {
  const server = serve({
    fetch: createApp(options).fetch,
    port: options.port,
    hostname: options.host,
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      process.stderr.write(`ngnui: port ${options.port} is already in use.\n`);
    } else {
      process.stderr.write(`ngnui: ${err.message}\n`);
    }
    process.exit(1);
  });

  const stop = () => {
    server.close(() => {
      closeDbClient();
      process.exit(0);
    });
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  return server;
}

// This module exists to be run: `tsx src/server/index.ts` in development and
// `import()`ed by bin/ngnui.mjs in a published install. Both configure it
// through the environment, so the two paths cannot drift.
startServer({
  port: Number(process.env.NGN_UI_PORT || 3000),
  host: process.env.NGN_UI_HOST || "127.0.0.1",
  liveUrl: process.env.NGN_UI_LIVE_URL || null,
  version: process.env.NGN_UI_VERSION || "dev",
});
