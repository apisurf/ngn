# ngn task scheduler

CLI scheduler for Node tasks.
Automate, monitor and orchestrate Javascript and Typescript tasks by single CLI command.

## Installation

Global installation

```bash
npm install -g @apisurf/ngn
ngn <command>
```

Or use without installing

```bash
npx @apisurf/ngn <command>
```

Cheat sheet:

```bash
ngn --version # check current version
ngn init # initialize ngn inside current folder
ngn add test.ts # add a task file
ngn run # start running all tasks
ngn run test.ts # start running tasks by glob match
ngn once test.ts # run once by glob match
ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20" # query a run history
```

## Writing a task

A task file exports `timing` — a cron pattern, seconds first — and `task`.
Everything else is optional.

```ts
// tasks/scrape.ts
import { TaskContext } from "@apisurf/ngn";

// Run every 5 seconds
export const timing = "*/5 * * * * *";

export const task = async (ctx: TaskContext) => {
  await ctx.log.info("fetching");

  const html = await fetch("https://example.com").then((res) => res.text());
  await ctx.kv.set("last-length", String(html.length));

  return { length: html.length };
};
```

`ctx` carries `log.info/error/warning`, `kv.get/set/delete`, `timing.start(label)`,
`env` and `meta`. Whatever `task` returns is recorded with the run.

### Hooks

Four more optional exports run around `task`. Each one gets the same `ctx`:

| Export | Runs |
| --- | --- |
| `shouldSkip` | Before `task`. Returning `true` skips the run — no other hook fires. |
| `onSuccess` | After `task` resolves. |
| `onError` | After `task` throws, with the error. The error is still rethrown. |
| `onComplete` | After success or failure. Not called on a skipped run. |

```ts
import { TaskContext } from "@apisurf/ngn";

export const timing = "*/5 * * * * *";

export const task = async (ctx: TaskContext) => {
  const end = ctx.timing.start("fetch");
  const html = await fetch("https://example.com").then((res) => res.text());
  await end();

  return { length: html.length };
};

// Skip the run entirely — nothing below this fires
export const shouldSkip = async (ctx: TaskContext) => {
  return (await ctx.kv.get("paused")) === "1";
};

export const onSuccess = async (ctx: TaskContext) => {
  await ctx.log.info("scrape ok");
};

// The error is still rethrown and recorded after this runs
export const onError = async (error: Error, ctx: TaskContext) => {
  await ctx.log.error(`scrape failed: ${error.message}`);
};

// Cleanup — runs after both success and failure
export const onComplete = async (ctx: TaskContext) => {
  await ctx.kv.set("last-run", new Date().toISOString());
};
```

## Reading what your tasks did

Runs, logs and timings go into one SQLite file — whatever `dbPath` in
`ngn.config.ts` points at. Set it to a `file:` URL; the default (`:memory:`)
keeps nothing once the process exits.

```ts
// ngn.config.ts
export default {
  dbPath: "file:./ngn.sqlite",
  match: ["tasks/**/*.ts"],
};
```

There are two ways to read that file, and neither needs the scheduler running.

**From the terminal** — `ngn sql` takes any query SQLite accepts and prints a
table, or `--json` / `--csv`. Rows go to stdout and counts to stderr, so piping
into `jq` works. It opens the file without migrating it, so a query can never
change the schema. `ngn sql --help` lists the tables and their columns.

```bash
ngn sql "SELECT status, COUNT(*) FROM task_runs GROUP BY status"
ngn sql "SELECT * FROM logs WHERE status = 'error' ORDER BY id DESC" --json
```

**In a browser** — [`@apisurf/ngnui`](https://www.npmjs.com/package/@apisurf/ngnui)
is a separate CLI that serves a prebuilt dashboard over the same file:

```bash
npx @apisurf/ngnui --db ./ngn.sqlite
```

`ngn run` prints the exact command for your project when it starts. The live
task editor in that UI needs a runtime to execute against, which only a running
`ngn run` has — pass `--live http://127.0.0.1:4545` (or whatever `port` is set
to in your config) to connect the two.
