// The live editor's line to a running `ngn run`.
//
// ngnui cannot execute a task: that takes the project's compiler, config and
// env, which only the scheduler process has. `ngn run` keeps a small loopback
// endpoint for exactly this — `GET /api/meta` to probe, `POST /api/live` to
// execute — and this module forwards to it.
//
// The endpoint is the one `ngnui --live <url>` was started with, read from the
// environment and never from a request. Taking it from the browser would make
// this server a proxy that sends arbitrary code to any address it is given.

import type { JsonValue } from "../lib/json";

export interface LiveTarget {
  /** Origin of the `ngn run` live server, e.g. `http://127.0.0.1:4545`. */
  url: string;
}

export function liveTarget(): LiveTarget | null {
  const raw = process.env.NGN_LIVE?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { url: url.origin };
  } catch {
    return null;
  }
}

export type LiveStatus =
  | { state: "off" }
  | { state: "up"; url: string; runtime: string; version: string | null }
  | { state: "down"; url: string; error: string };

/** A probe is a local round trip; anything slower than this is not coming. */
const PROBE_TIMEOUT_MS = 1500;

export async function probeLive(target: LiveTarget | null): Promise<LiveStatus> {
  if (!target) return { state: "off" };
  try {
    const response = await fetch(`${target.url}/api/meta`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { state: "down", url: target.url, error: `answered ${response.status}` };
    }
    const meta = (await response.json()) as {
      runtime?: unknown;
      version?: unknown;
      live?: unknown;
    };
    if (meta.live !== true) {
      return { state: "down", url: target.url, error: "is not an ngn live endpoint" };
    }
    return {
      state: "up",
      url: target.url,
      runtime: typeof meta.runtime === "string" ? meta.runtime : "ngn",
      version: typeof meta.version === "string" ? meta.version : null,
    };
  } catch (err) {
    return { state: "down", url: target.url, error: reason(err) };
  }
}

export type LiveLanguage = "typescript" | "javascript";

export type LiveOutcome =
  | { ok: true; result: JsonValue; ms: number }
  | { ok: false; error: string; ms: number };

/**
 * How long a live task may take. It is a person's own code on their own
 * machine; the limit only exists so a hung task frees the editor eventually.
 */
const EXECUTE_TIMEOUT_MS = 5 * 60_000;

export async function executeLive(
  target: LiveTarget,
  code: string,
  language: LiveLanguage,
): Promise<LiveOutcome> {
  const started = performance.now();
  const elapsed = () => performance.now() - started;
  try {
    const response = await fetch(`${target.url}/api/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, language }),
      signal: AbortSignal.timeout(EXECUTE_TIMEOUT_MS),
    });
    // The endpoint answers with `c.json(...)`, so whatever came back is JSON.
    const body = (await response.json().catch(() => null)) as {
      result?: JsonValue;
      error?: unknown;
    } | null;
    if (!response.ok || !body || "error" in body) {
      const error =
        typeof body?.error === "string"
          ? `ngn run: ${body.error}`
          : `ngn run answered ${response.status}`;
      return { ok: false, error, ms: elapsed() };
    }
    return { ok: true, result: body.result ?? null, ms: elapsed() };
  } catch (err) {
    return { ok: false, error: `Could not reach ${target.url}: ${reason(err)}`, ms: elapsed() };
  }
}

function reason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return "timed out";
    // fetch wraps the socket error; the cause is the part worth reading.
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code === "ECONNREFUSED") return "nothing is listening — is `ngn run` still running?";
    return cause?.message ?? err.message;
  }
  return String(err);
}
