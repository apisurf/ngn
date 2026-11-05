import { describe, expect, it, vi } from "vitest";
import { initOptions } from "../src/cliCmd/init";
import { type Actions, buildProgram } from "../src/program";

/** Parse a command line with every action stubbed, and say what each one got. */
async function parse(...argv: string[]) {
  const actions = {
    init: vi.fn(),
    addTask: vi.fn(),
    run: vi.fn(),
    runOnce: vi.fn(),
    runSingle: vi.fn(),
    sql: vi.fn(),
    ui: vi.fn(),
    status: vi.fn(),
    runs: vi.fn(),
    show: vi.fn(),
    logs: vi.fn(),
    compile: vi.fn(),
    initDbFile: vi.fn(),
  } satisfies Actions;
  const program = buildProgram(actions).exitOverride();
  await program.parseAsync(["node", "ngn", ...argv]);
  return actions;
}

/** What `ngn init <argv>` would write. */
async function initWith(...argv: string[]) {
  const { init } = await parse("init", ...argv);
  return initOptions(init.mock.calls[0]![0]);
}

describe("ngn init flags", () => {
  it("takes the glossary's names", async () => {
    expect(
      await initWith(
        "--db",
        "./runs.db",
        "--port",
        "5000",
        "--config",
        "x.config.ts",
        "--env-file",
        ".env.local",
      ),
    ).toEqual({
      configFile: "x.config.ts",
      options: {
        dbPath: "file:./runs.db",
        port: 5000,
        match: ["tasks/**/*.ts"],
        envFile: ".env.local",
      },
    });
  });

  it("still takes the names they had before", async () => {
    expect(
      await initWith(
        "--dbFile",
        "./runs.db",
        "--apiPort",
        "5000",
        "--configFile",
        "x.config.ts",
        "--envFile",
        ".env.local",
      ),
    ).toEqual(
      await initWith(
        "--db",
        "./runs.db",
        "--port",
        "5000",
        "--config",
        "x.config.ts",
        "--env-file",
        ".env.local",
      ),
    );
  });

  it("prefers the current name when both are given", async () => {
    expect((await initWith("--db", "./new.db", "--dbFile", "./old.db"))?.options.dbPath).toBe(
      "file:./new.db",
    );
  });

  it("records runs in a file unless told :memory:", async () => {
    expect((await initWith())?.options.dbPath).toBe("file:./ngn.sqlite");
    expect((await initWith("--db", ":memory:"))?.options.dbPath).toBe(":memory:");
  });

  it("refuses a port that is not one", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await initWith("--port", "nope")).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("--port expects a number"));
    error.mockRestore();
  });

  it("keeps the old names out of the help", () => {
    const help = buildProgram({} as Actions)
      .commands.find((c) => c.name() === "init")!
      .helpInformation();
    expect(help).toContain("--env-file");
    expect(help).not.toContain("--dbFile");
    expect(help).not.toContain("--apiPort");
  });
});

describe("flag names across commands", () => {
  it("names the database --db wherever a command takes one", async () => {
    const { sql } = await parse("sql", "SELECT 1", "--db", "./ngn.sqlite", "--max-width", "20");
    expect(sql.mock.calls[0]![1]).toMatchObject({ db: "./ngn.sqlite", maxWidth: "20" });
  });

  it("hands run's task names on, --match included", async () => {
    const { run } = await parse("run", "scrape.ts", "api/**", "--match", "old.ts");
    expect(run.mock.calls[0]![0]).toEqual({
      root: undefined,
      tasks: ["scrape.ts", "api/**", "old.ts"],
    });
  });
});

describe("ngn run's forms", () => {
  it("schedules every task when none is named", async () => {
    const { run } = await parse("run");
    expect(run.mock.calls[0]![0]).toEqual({ root: undefined, tasks: [] });
  });

  it("runs one task now with --once", async () => {
    const { run, runOnce } = await parse("run", "scrape", "--once", "--root", "/p");
    expect(run).not.toHaveBeenCalled();
    expect(runOnce.mock.calls[0]).toEqual(["scrape", { root: "/p" }]);
  });

  it("schedules one file on a given pattern with --timing, keeping the config", async () => {
    const { runSingle } = await parse("run", "scrape.ts", "-t", "*/2 * * * * *");
    expect(runSingle.mock.calls[0]).toEqual([
      "scrape.ts",
      { root: undefined, timing: "*/2 * * * * *", config: true },
    ]);
  });

  it("drops the config with --no-config", async () => {
    const { runSingle } = await parse("run", "scrape.ts", "--timing", "* * * * * *", "--no-config");
    expect(runSingle.mock.calls[0]![1]).toMatchObject({ config: false });
  });

  it("wants exactly one task for --once and --timing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const none = await parse("run", "--once");
    const two = await parse("run", "a.ts", "b.ts", "-t", "* * * * * *");
    expect(none.runOnce).not.toHaveBeenCalled();
    expect(two.runSingle).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("ngn: --once takes one task (got none)");
    expect(error).toHaveBeenCalledWith("ngn: --timing takes one task (got 2)");
    error.mockRestore();
    process.exitCode = undefined;
  });

  it("keeps run:once and run:single working, out of the help", async () => {
    const { runOnce } = await parse("run:once", "scrape");
    expect(runOnce.mock.calls[0]![0]).toBe("scrape");
    const { runSingle } = await parse("run:single", "x.ts", "-t", "* * * * * *");
    expect(runSingle.mock.calls[0]![1]).toMatchObject({ timing: "* * * * * *", config: false });
    const help = buildProgram({} as Actions).helpInformation();
    expect(help).not.toContain("run:once");
    expect(help).not.toContain("run:single");
  });
});

describe("help", () => {
  const help = async (...argv: string[]) => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await parse("help", ...argv);
    const text = out.mock.calls.map((call) => String(call[0])).join("");
    out.mockRestore();
    return text;
  };

  it("groups the commands by intent on the first screen", () => {
    const text = buildProgram({} as Actions).helpInformation();
    for (const heading of ["Set up", "Run", "Inspect", "Reference"])
      expect(text).toContain(`\n${heading}\n`);
    expect(text).toMatch(/run \[task…\].*\(blocks\)/);
    expect(text.split("\n").length).toBeLessThan(40);
  });

  it("lists every command people use, and no hidden one", () => {
    const program = buildProgram({} as Actions);
    const text = program.helpInformation();
    for (const name of ["init", "add", "run", "sql"]) expect(text).toContain(`  ${name} `);
    expect(text).not.toContain("run:once");
  });

  it("prints a topic, a command's options, or everything", async () => {
    expect(await help("schema")).toContain("task_runs");
    expect(await help("config")).toContain("dbPath");
    expect(await help("run")).toContain("Usage: ngn run");
    const all = await help("--all");
    expect(all.indexOf("Examples")).toBe(0);
    for (const marker of [
      "Task file",
      "ngn.config.ts",
      "ctx.sqlite",
      "Queues",
      "task_runs",
      "ngn sql\n",
    ]) {
      expect(all).toContain(marker);
    }
  });

  it("says which topics exist when asked for one that does not", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await help("nope");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Topics: task, config, ctx, queue, schema"),
    );
    error.mockRestore();
    process.exitCode = undefined;
  });
});
