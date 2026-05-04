#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import handler from "serve-handler";
import http from "node:http";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "client");

// Parse CLI args
const args = process.argv.slice(2);

function getArg(name: string, defaultValue: string): string {
  const idx = args.findIndex((a) => a === `--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`) || args.includes(`-${name.charAt(0)}`);
}

if (hasFlag("help") || hasFlag("h")) {
  console.log(`
ngn-ui - Serve the ngn UI dashboard

Usage:
  ngn-ui [options]

Options:
  --port <number>     Port to serve on (default: 3000)
  --api-url <url>     API URL to connect to (default: http://localhost:8787/api)
  --help, -h          Show this help message
`);
  process.exit(0);
}

const port = parseInt(getArg("port", "3000"), 10);
const apiUrl = getArg("api-url", "http://localhost:8787/api");

// Read and modify index.html to inject config
const indexPath = join(staticDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`Error: Could not find index.html at ${indexPath}`);
  console.error("Make sure the UI has been built before running this command.");
  process.exit(1);
}

let indexHtml = fs.readFileSync(indexPath, "utf-8");
const configScript = `<script>window.__NGN_CONFIG__={apiUrl:"${apiUrl}"}</script>`;
indexHtml = indexHtml.replace("</head>", `${configScript}</head>`);

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  // Serve modified index.html for root and SPA routes (no file extension)
  if (url === "/" || (!url.includes(".") && !url.startsWith("/assets"))) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(indexHtml);
    return;
  }

  // Serve static files
  return handler(req, res, {
    public: staticDir,
  });
});

server.listen(port, () => {
  console.log(`ngn-ui running at http://localhost:${port}`);
  console.log(`API URL: ${apiUrl}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
