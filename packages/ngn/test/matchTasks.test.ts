import { describe, expect, it } from "vitest";
import { describeAmbiguous, describeNoMatch, matchTasks } from "../src/util/matchTasks";

const TASKS = [
  "tasks/scrape.ts",
  "tasks/api/sync-users.ts",
  "tasks/api/health.ts",
  "tasks/web/health.ts",
  "jobs/cleanup.ts",
];

const paths = (pattern: string) => matchTasks(TASKS, pattern).paths;

describe("matchTasks", () => {
  it("takes an exact path from the root first", () => {
    expect(paths("tasks/scrape.ts")).toEqual(["tasks/scrape.ts"]);
    expect(paths("./jobs/cleanup.ts")).toEqual(["jobs/cleanup.ts"]);
  });

  it("then the same path under the tasks folder", () => {
    expect(paths("scrape.ts")).toEqual(["tasks/scrape.ts"]);
    expect(paths("api/health.ts")).toEqual(["tasks/api/health.ts"]);
  });

  it("then a basename or path suffix, whole segments only, with or without the extension", () => {
    expect(paths("sync-users.ts")).toEqual(["tasks/api/sync-users.ts"]);
    expect(paths("sync-users")).toEqual(["tasks/api/sync-users.ts"]);
    expect(paths("cleanup")).toEqual(["jobs/cleanup.ts"]);
    expect(paths("users.ts")).toEqual([]);
  });

  it("ignores case", () => {
    expect(paths("Tasks/Scrape.TS")).toEqual(["tasks/scrape.ts"]);
  });

  it("returns every task a name fits, and describes the ambiguity", () => {
    const match = matchTasks(TASKS, "health.ts");
    expect(match.paths).toEqual(["tasks/api/health.ts", "tasks/web/health.ts"]);
    expect(describeAmbiguous(match)).toContain("matches 2 tasks");
    expect(describeAmbiguous(match)).toContain("tasks/web/health.ts");
  });

  it("matches globs against the path from the root, as before", () => {
    expect(paths("tasks/api/*.ts")).toEqual(["tasks/api/sync-users.ts", "tasks/api/health.ts"]);
    expect(paths("**/health.ts")).toEqual(["tasks/api/health.ts", "tasks/web/health.ts"]);
    expect(paths("tasks/{scrape,nope}.ts")).toEqual(["tasks/scrape.ts"]);
  });

  it("suggests the nearest tasks when nothing matches", () => {
    const match = matchTasks(TASKS, "scrap.ts");
    expect(match.paths).toEqual([]);
    expect(match.suggestions).toEqual(["tasks/scrape.ts"]);
    expect(describeNoMatch(match)).toContain("Did you mean");
    expect(describeNoMatch(match)).toContain("tasks/scrape.ts");
  });

  it("explains how names resolve when nothing is close", () => {
    const match = matchTasks(TASKS, "zzzzzzzz");
    expect(match.suggestions).toEqual([]);
    expect(describeNoMatch(match)).toContain("under tasks/");
  });
});
