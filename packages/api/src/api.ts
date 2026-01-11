import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Client } from "ngn-persistence";
import { getDbClient } from "~/lib/db.js";
import { createRouter as createDashboardRouter } from "./routers/dashboard.js";
import { createRouter as createFileTasksRouter } from "./routers/fileTasks.js";
import { createRouter as createTasksRunsRouter } from "./routers/taskRuns.js";
import { createRouter as createLogsRouter } from "./routers/logs.js";
import { createRouter as createTimingsRouter } from "./routers/timings.js";
import { createRouter as createLiveRouter } from "./routers/live.js";
import type { ApiConfig, CoreControls } from "./types.js";

export type { CoreControls };

export async function runApi(
  apiConfig: ApiConfig,
  options?: { coreControls: CoreControls }
) {
  let dbClient: Client;

  console.log("Starting api");

  if ("dbPath" in apiConfig) {
    dbClient = await getDbClient(apiConfig.dbPath);
  } else {
    dbClient = apiConfig.dbClient;
  }

  const app = new Hono();

  const apiRouter = new Hono();
  apiRouter.use("*", cors());
  apiRouter.route("/dashboard", createDashboardRouter(dbClient));
  apiRouter.route("/file-tasks", createFileTasksRouter(dbClient));
  apiRouter.route("/runs", createTasksRunsRouter(dbClient));
  apiRouter.route("/logs", createLogsRouter(dbClient));
  apiRouter.route("/timings", createTimingsRouter(dbClient));

  // if coreControls are provided, add the live router
  if (options?.coreControls) {
    apiRouter.route("/live", createLiveRouter(dbClient, options.coreControls));
  }

  app.route("/api", apiRouter);

  // serve SPA static files and handle
  if (apiConfig.staticFilesPath) {
    const staticFilesRoot = apiConfig.staticFilesPath;
    console.log(`Serving static files from ${staticFilesRoot}`);

    // Serve static files (assets, JS, CSS, etc.)
    app.use(
      "*",
      serveStatic({
        root: staticFilesRoot,
        rewriteRequestPath: (path) => {
          if (path.startsWith("/ui")) {
            return path.replace(/^\/ui/, "") || "/";
          } else {
            return `/ui/${path}`;
          }
        },
        onNotFound: (path, c) => {
          console.log(`${path} is not found, request to ${c.req.path}`);
        },
      })
    );

    // Catch-all route for SPA - serve index.html for any unmatched routes
    // This allows client-side routing to work
    app.get(
      "*",
      serveStatic({
        path: "./index.html",
        root: staticFilesRoot,
      })
    );
  }

  const server = serve({
    fetch: app.fetch,
    port: apiConfig.port,
  });

  // Handle server errors (like EADDRINUSE)
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${apiConfig.port} is already in use. Please close the other application or use a different port.`
      );
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
      process.exit(1);
    }
  });

  console.log(`Server is running at http://localhost:${apiConfig.port}`);

  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    server.close((err) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      process.exit(0);
    });
  });

  return server;
}
