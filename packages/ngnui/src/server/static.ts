import { existsSync } from "node:fs";
/**
 * Serving the prebuilt client that ships in the package.
 *
 * The files sit next to the bundled server (`dist/server.js` and
 * `dist/client/`), so they are located relative to this module rather than the
 * working directory — ngnui is run from wherever the database happens to be.
 *
 * A path that escapes the client directory is not served, which matters more
 * here than it looks: the process is pointed at a database full of real
 * payloads and lives in the same folder as the project it belongs to.
 */
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_DIR = fileURLToPath(new URL("./client/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

export interface Asset {
  body: Buffer;
  type: string;
  /** Vite fingerprints everything under /assets, so it can be cached forever. */
  immutable: boolean;
}

/** Whether this install has a built client at all. */
export function hasClient(): boolean {
  return existsSync(join(CLIENT_DIR, "index.html"));
}

/** The file at `pathname`, or null when there is no such file to serve. */
export async function clientAsset(pathname: string): Promise<Asset | null> {
  const decoded = safeDecode(pathname);
  if (decoded === null || decoded === "/") return null;

  const target = resolve(CLIENT_DIR, `.${normalize(decoded)}`);
  if (
    !target.startsWith(CLIENT_DIR.endsWith(sep) ? CLIENT_DIR : CLIENT_DIR + sep)
  ) {
    return null;
  }

  try {
    const body = await readFile(target);
    return {
      body,
      type: TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      immutable: decoded.startsWith("/assets/"),
    };
  } catch {
    // Missing file, or a directory: both mean "not an asset", and the caller
    // falls through to the SPA shell.
    return null;
  }
}

/** The SPA shell, or null when the client was never built. */
export async function indexHtml(): Promise<string | null> {
  try {
    return await readFile(join(CLIENT_DIR, "index.html"), "utf8");
  } catch {
    return null;
  }
}

function safeDecode(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}
