import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { descriptionPath, readDescription } from "../src/server/description";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ngnui-description-"));
  mkdirSync(join(root, "tasks", "api"), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("a task's description", () => {
  it("is the Markdown file beside the task", () => {
    expect(descriptionPath("tasks/api/sync-users.ts")).toBe("tasks/api/sync-users.md");
    expect(descriptionPath("report.js")).toBe("report.md");
    writeFileSync(join(root, "tasks/api/sync-users.md"), "# Sync users\n");
    expect(readDescription(root, "tasks/api/sync-users.ts")).toBe("# Sync users\n");
  });

  it("is null when there is no such file", () => {
    expect(readDescription(root, "tasks/api/other.ts")).toBeNull();
  });

  it("never reads outside the project", () => {
    writeFileSync(join(root, "..", "outside.md"), "secret");
    try {
      expect(readDescription(join(root, "tasks"), "../../outside.ts")).toBeNull();
    } finally {
      rmSync(join(root, "..", "outside.md"), { force: true });
    }
  });
});
