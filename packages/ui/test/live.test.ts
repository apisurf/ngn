import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { liveTarget, probeLive, runTaskNow } from "../src/server/live";

/**
 * A stand-in `ngn run` that answers `/api/meta` with whatever `meta` holds, and
 * `/api/run` with `runAnswer`, keeping the path it was asked to run.
 */
let meta: Record<string, unknown> = {};
let runAnswer: { status: number; body: unknown } = { status: 200, body: { started: true } };
let ranPath: string | null = null;
let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/run") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        ranPath = (JSON.parse(body) as { path: string }).path;
        res.statusCode = runAnswer.status;
        res.end(JSON.stringify(runAnswer.body));
      });
      return;
    }
    res.end(JSON.stringify(meta));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((done) => server.close(() => done())));

afterEach(() => {
  delete process.env.NGN_LIVE;
  delete process.env.NGN_LIVE_SOURCE;
  delete process.env.NGN_DB;
});

function target(source: "flag" | "config") {
  process.env.NGN_LIVE = url;
  if (source === "config") process.env.NGN_LIVE_SOURCE = "config";
  process.env.NGN_DB = "/work/project/ngn.sqlite";
  return liveTarget();
}

describe("probeLive", () => {
  it("is off with no endpoint", async () => {
    expect(await probeLive(liveTarget())).toEqual({ state: "off" });
  });

  it("takes a runtime found in the config when it serves the same database", async () => {
    meta = { runtime: "ngn", version: "0.3.0", live: true, db: "/work/project/ngn.sqlite" };
    expect(await probeLive(target("config"))).toMatchObject({
      state: "up",
      version: "0.3.0",
      run: false,
    });
  });

  it("says when the runtime can start a task's run", async () => {
    meta = { runtime: "ngn", version: "0.4.0", live: true, run: true };
    expect(await probeLive(target("flag"))).toMatchObject({ state: "up", run: true });
  });

  it("refuses a runtime found in the config that serves another database", async () => {
    meta = { runtime: "ngn", version: "0.3.0", live: true, db: "/elsewhere/ngn.sqlite" };
    expect(await probeLive(target("config"))).toMatchObject({
      state: "down",
      source: "config",
      error: "serves another database (/elsewhere/ngn.sqlite)",
    });
  });

  it("takes an older runtime that does not say which database it serves", async () => {
    meta = { runtime: "ngn", version: "0.2.9", live: true };
    expect(await probeLive(target("config"))).toMatchObject({ state: "up" });
  });

  it("leaves an explicit --live alone, whatever it serves", async () => {
    meta = { runtime: "ngn", version: "0.3.0", live: true, db: "/elsewhere/ngn.sqlite" };
    expect(await probeLive(target("flag"))).toMatchObject({ state: "up" });
  });
});

describe("runTaskNow", () => {
  it("asks the runtime to run the task by its path", async () => {
    runAnswer = { status: 200, body: { started: true } };
    expect(await runTaskNow(target("flag")!, "tasks/extract.ts")).toEqual({ ok: true });
    expect(ranPath).toBe("tasks/extract.ts");
  });

  it("passes on why the runtime would not", async () => {
    runAnswer = { status: 409, body: { error: "a run of it is still going" } };
    expect(await runTaskNow(target("flag")!, "tasks/extract.ts")).toEqual({
      ok: false,
      error: "ngn run: a run of it is still going",
    });
  });
});
