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
ngn run # start running all tasks (blocks until Ctrl-C)
ngn run --match "tasks/test.ts" # run a subset — match the path, and quote the glob
ngn run:once tasks/test.ts # run one task now, then exit
ngn run:single tasks/test.ts -t "*/2 * * * * *" # schedule one task on your own pattern
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
`sqlite`, `env` and `meta`. Whatever `task` returns is recorded with the run.

Anything else a task needs, it imports itself:

```ts
import { S3Client } from "@aws-sdk/client-s3"; // npm install it in your project
```

Only your task code is bundled. Imports are left alone and resolved from your
own `node_modules` at run time, so the version you installed is the version
that runs.

### Storing data with `ctx.sqlite`

Every task gets its own SQLite database, with nothing to configure. It lives
next to the task file — `tasks/scrape.ts` writes to `tasks/scrape.db` — and the
file is only created once the task actually uses it.

This is your data, and it is a different file from the one `dbPath` points at:
that one is ngn's own, holding the run history described
[below](#reading-what-your-tasks-did).

```ts
export const task = async (ctx: TaskContext) => {
  await ctx.sqlite.execute("CREATE TABLE IF NOT EXISTS pages (url TEXT, seen TEXT)");
  await ctx.sqlite.execute("INSERT INTO pages (url, seen) VALUES (?, ?)", [
    "https://example.com",
    new Date().toISOString(),
  ]);

  const { rows } = await ctx.sqlite.execute("SELECT COUNT(*) AS n FROM pages");
  await ctx.log.info(`${rows[0].n} pages`);
};
```

| Member | Does |
| --- | --- |
| `execute(sql, args?)` | One statement against the task's own database. |
| `batch(statements)` | Several statements in one round trip. |
| `client` | The raw libsql client, for anything the above does not cover. |
| `path` | Absolute path of the task's own database file. |
| `initDB({ file, migrations })` | Open another database in the task's folder. |
| `destroyDB(file)` | Delete a database file in the task's folder. |

`initDB` takes a path relative to the task's folder and runs any migrations you
give it, once each — they are tracked in a `_ngn_migrations` table inside that
database:

```ts
const cache = await ctx.sqlite.initDB({
  file: "cache.db",
  migrations: [
    { id: "2026-01-13-001", up: "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)" },
    { id: "2026-01-14-001", up: "ALTER TABLE items ADD COLUMN qty INTEGER" },
  ],
});

await cache.execute("INSERT INTO items (name, qty) VALUES (?, ?)", ["widget", 3]);
```

A task can only reach databases inside its own folder. Absolute paths and paths
that climb out with `..` are rejected, so one task's data cannot be opened or
deleted by a task sitting in a different folder. Subfolders of the task's own
folder are fine.

Connections are held open between runs and closed when `ngn` shuts down.

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
import { defineConfig } from "@apisurf/ngn";

export default defineConfig({
  dbPath: "file:./ngn.sqlite",
  port: 4545,
  match: ["tasks/**/*.ts"],
  envFile: ".env",
});
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
