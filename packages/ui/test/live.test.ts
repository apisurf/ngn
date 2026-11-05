import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { liveTarget, probeLive } from "../src/server/live";

/** A stand-in `ngn run` that answers `/api/meta` with whatever `meta` holds. */
let meta: Record<string, unknown> = {};
let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
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
    expect(await probeLive(target("config"))).toMatchObject({ state: "up", version: "0.3.0" });
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
