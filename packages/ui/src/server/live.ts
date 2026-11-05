// The live editor's line to a running `ngn run`.
//
// ngnui cannot execute a task: that takes the project's compiler, config and
// env, which only the scheduler process has. `ngn run` keeps a small loopback
// endpoint for exactly this — `GET /api/meta` to probe, `POST /api/live` to
// execute — and this module forwards to it.
//
// The endpoint is the one `ngnui --live <url>` was started with, or the loopback
// port the project's ngn.config.ts names, read from the environment and never
// from a request. Taking it from the browser would make this server a proxy that
// sends arbitrary code to any address it is given.

import type { JsonValue } from "../lib/json";
import { dbPath } from "./db";

export interface LiveTarget {
  /** Origin of the `ngn run` live server, e.g. `http://127.0.0.1:4545`. */
  url: string;
  /**
   * `flag` when `--live` named it, `config` when ngnui took the port from the
   * project's config. A config one is only trusted while it serves this file.
   */
  source: "flag" | "config";
}

export function liveTarget(): LiveTarget | null {
  const raw = process.env.NGN_LIVE?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return {
      url: url.origin,
      source: process.env.NGN_LIVE_SOURCE === "config" ? "config" : "flag",
    };
  } catch {
    return null;
  }
}

export type LiveStatus =
  | { state: "off" }
  | { state: "up"; url: string; runtime: string; version: string | null }
  | { state: "down"; url: string; error: string; source: LiveTarget["source"] };

/** A probe is a local round trip; anything slower than this is not coming. */
const PROBE_TIMEOUT_MS = 1500;

export async function probeLive(target: LiveTarget | null): Promise<LiveStatus> {
  if (!target) return { state: "off" };
  try {
    const response = await fetch(`${target.url}/api/meta`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const down = (error: string): LiveStatus => ({
      state: "down",
      url: target.url,
      error,
      source: target.source,
    });
    if (!response.ok) return down(`answered ${response.status}`);
    const meta = (await response.json()) as {
      runtime?: unknown;
      version?: unknown;
      live?: unknown;
      db?: unknown;
    };
    if (meta.live !== true) return down("is not an ngn live endpoint");
    // Another project's `ngn run` on the same port must not run this one's drafts.
    // Older runtimes do not say which file they serve, and are taken at their port.
    if (target.source === "config" && typeof meta.db === "string" && meta.db !== dbPath()) {
      return down(`serves another database (${meta.db})`);
    }
    return {
      state: "up",
      url: target.url,
      runtime: typeof meta.runtime === "string" ? meta.runtime : "ngn",
      version: typeof meta.version === "string" ? meta.version : null,
    };
  } catch (err) {
    return { state: "down", url: target.url, error: reason(err), source: target.source };
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
