import { describe, expect, it } from "vitest";
import { tabKeyFor } from "../src/lib/tabs";

describe("tabKeyFor", () => {
  it("files every page's URL under its own tab", () => {
    expect(tabKeyFor("/")).toBe("overview");
    expect(tabKeyFor("/history")).toBe("history");
    expect(tabKeyFor("/logs")).toBe("logs");
    expect(tabKeyFor("/query")).toBe("query");
    expect(tabKeyFor("/live")).toBe("live");
    expect(tabKeyFor("/tasks/3")).toBe("task:3");
    expect(tabKeyFor("/tasks/3/")).toBe("task:3");
    expect(tabKeyFor("/tasks/3/runs/41")).toBe("run:41");
  });

  it("owns no tab for a URL that only redirects, or leads nowhere", () => {
    expect(tabKeyFor("/runs/41")).toBeNull();
    expect(tabKeyFor("/nope")).toBeNull();
  });
});
