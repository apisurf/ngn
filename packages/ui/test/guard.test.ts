import { describe, expect, it } from "vitest";
import { isLoopbackHost, refuseRun } from "../src/server/guard";

describe("the loopback guard", () => {
  it("answers to loopback names only", () => {
    expect(isLoopbackHost("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("[::1]:4000")).toBe(true);
    // What a DNS-rebinding page's requests carry.
    expect(isLoopbackHost("evil.example:3000")).toBe(false);
    expect(isLoopbackHost("127.0.0.1.evil.example")).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });

  const ok = { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", token: "t", expected: "t" };

  it("lets this server's own page run things", () => {
    expect(refuseRun(ok)).toBeNull();
    // A same-origin fetch without an Origin header is still this page.
    expect(refuseRun({ ...ok, origin: null })).toBeNull();
  });

  it("refuses another origin, a missing token, and a foreign Host", () => {
    expect(refuseRun({ ...ok, origin: "https://evil.example" })).toMatch(/own pages/);
    expect(refuseRun({ ...ok, token: null })).toMatch(/token/);
    expect(refuseRun({ ...ok, token: "old" })).toMatch(/token/);
    expect(refuseRun({ ...ok, host: "evil.example:3000" })).toMatch(/127\.0\.0\.1/);
  });
});
