/**
 * Forwarding live executions to a running `ngn`.
 *
 * The viewer can read a database from anywhere, but it cannot run a task:
 * compiling and executing one needs the project's config, env and plugins,
 * which exist only inside an `ngn run` process. So `ngn run` keeps a small
 * live endpoint of its own and this forwards to it, which also keeps the
 * execution on the machine that owns the project rather than the one browsing.
 *
 * When there is no such process the page gets a clear 503 instead of a hang,
 * and `/api/meta` says so up front so the editor can disable itself before
 * anyone writes code into it.
 */
import { Hono } from "hono";

/** A live process is either up or it is not; nobody waits four seconds to learn that. */
const PROBE_TIMEOUT_MS = 700;
/** Task code can legitimately take a while — this is a ceiling, not a target. */
const EXECUTE_TIMEOUT_MS = 120_000;

export interface LiveStatus {
  url: string | null;
  available: boolean;
}

export function liveRouter(liveUrl: string | null) {
  const router = new Hono();

  router.post("/", async (c) => {
    if (!liveUrl) {
      return c.json(
        {
          error: "live execution unavailable",
          detail:
            "ngnui reads a database file; it cannot run tasks. Start `ngn run` and point ngnui at it with --live <url>.",
        },
        503,
      );
    }

    let response: Response;
    try {
      response = await fetch(`${trimSlash(liveUrl)}/api/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await c.req.text(),
        signal: AbortSignal.timeout(EXECUTE_TIMEOUT_MS),
      });
    } catch (error) {
      return c.json(
        {
          error: "live execution unreachable",
          detail: `No ngn process answered at ${liveUrl} (${message(error)}).`,
        },
        503,
      );
    }

    // Pass the runtime's own answer through untouched, including its status:
    // a task that threw is the caller's result, not this hop's failure.
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  });

  return router;
}

/** Whether an `ngn run` is answering right now. Never throws. */
export async function probeLive(liveUrl: string | null): Promise<LiveStatus> {
  if (!liveUrl) return { url: null, available: false };

  try {
    const response = await fetch(`${trimSlash(liveUrl)}/api/meta`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { url: liveUrl, available: response.ok };
  } catch {
    return { url: liveUrl, available: false };
  }
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
