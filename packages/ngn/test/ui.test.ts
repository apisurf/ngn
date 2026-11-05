import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findNgnui, servedUrl } from "../src/cliCmd/ui";
import { type Actions, buildProgram } from "../src/program";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("findNgnui", () => {
  it("prefers the project's own install", () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "ngn-ui-test-")));
    const pkg = join(dir, "node_modules", "@apisurf", "ngnui");
    mkdirSync(join(pkg, "bin"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), '{"name":"@apisurf/ngnui"}');
    writeFileSync(join(pkg, "bin", "ngnui.mjs"), "");
    expect(findNgnui(dir, { onPath: () => true })).toMatchObject({
      command: process.execPath,
      args: [join(pkg, "bin", "ngnui.mjs")],
    });
  });

  it("then one on PATH, then npx", () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "ngn-ui-test-")));
    expect(findNgnui(dir, { onPath: () => true })).toMatchObject({ command: "ngnui", args: [] });
    expect(findNgnui(dir, { onPath: () => false })).toMatchObject({
      command: "npx",
      args: ["--yes", "@apisurf/ngnui"],
    });
  });
});

describe("servedUrl", () => {
  it("reads where ngnui is serving from its readout", () => {
    expect(servedUrl("  open       http://127.0.0.1:3001")).toBe("http://127.0.0.1:3001");
    expect(servedUrl("  database   /x/ngn.sqlite")).toBeNull();
  });
});

describe("ngn ui", () => {
  it("takes a run id and opens a browser unless told not to", async () => {
    const ui = vi.fn();
    const program = buildProgram({ ui } as unknown as Actions).exitOverride();
    await program.parseAsync(["node", "ngn", "ui", "41"]);
    expect(ui.mock.calls[0]!.slice(0, 2)).toEqual(["41", { open: true }]);
    await program.parseAsync(["node", "ngn", "ui", "--no-open", "--db", "./x.sqlite"]);
    expect(ui.mock.calls[1]!.slice(0, 2)).toEqual([undefined, { open: false, db: "./x.sqlite" }]);
  });
});
