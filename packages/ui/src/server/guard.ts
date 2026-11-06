// What keeps a local viewer local.
//
// Binding to 127.0.0.1 keeps the network out, but not the browser: any page
// open in it can send requests to 127.0.0.1:3000, and a page on a domain that
// re-resolves to 127.0.0.1 (DNS rebinding) can read the answers too. The
// database holds whatever tasks logged, and the UI can start runs (the Editor's
// code, a task's Run now), so both matter. Three checks, each closing one door:
//
//   Host     must be a loopback name. A rebinding page's requests carry its
//            own domain here, so every page and function refuses them. This
//            runs on every request, reads included.
//   Origin   when present, must be this server. A cross-site form or fetch
//            always sends one, so a page elsewhere cannot start a run blind.
//   Token    a random value minted when the server starts, handed to the
//            page in its own loader and required by every function that
//            runs something. Only a page this server rendered has it.
//
// Pure functions over strings, so they are testable without a server.

import { randomUUID } from "node:crypto";
import { isLoopbackHost } from "./loopback";

export { isLoopbackHost };

/** Why a request may not run anything, or null when it may. */
export function refuseRun(headers: {
  host: string | null;
  origin: string | null;
  token: string | null;
  expected: string;
}): string | null {
  if (!isLoopbackHost(headers.host)) return "this server only answers to 127.0.0.1 and localhost";
  if (headers.origin) {
    let originHost: string;
    try {
      originHost = new URL(headers.origin).host;
    } catch {
      return "the request's Origin is not a URL";
    }
    if (originHost !== headers.host) return "runs can only be started from this UI's own pages";
  }
  if (headers.token !== headers.expected) {
    return "the run token is missing or stale — reload the page";
  }
  return null;
}

/**
 * This server's run token. NGN_UI_TOKEN when the launcher set one, so every
 * worker agrees; otherwise one per process.
 */
export const RUN_TOKEN: string = process.env.NGN_UI_TOKEN ?? randomUUID();
