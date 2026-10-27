# ngn task scheduler

CLI scheduler for Node tasks.
Automate, monitor and orchestrate Javascript and Typescript tasks by single CLI command.

Everything ngn knows lives in SQLite files on your disk: the run history, the
locks tasks share, and the job queues they hand work through. There is no
server or broker to run beside it.

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

A task file exports `timing` — a cron pattern — and `task`. Everything else is
optional.

```ts
// tasks/scrape.ts
import { TaskContext } from "@apisurf/ngn";

// Run every 5 seconds
export const timing = "*/5 * * * * *";

export const task = async (ctx: TaskContext) => {
  await ctx.log.info("fetching");

  const html = await fetch("https://example.com", { signal: ctx.run.signal }).then((res) =>
    res.text(),
  );
  await ctx.kv.set("last-length", String(html.length));

  return { length: html.length };
};
```

`timing` takes six fields, seconds first (`"*/5 * * * * *"`), or the usual
five, minutes first (`"*/5 * * * *"`). Whatever `task` returns is recorded with
the run, as JSON in `task_runs.result`.

Anything else a task needs, it imports itself:

```ts
import { S3Client } from "@aws-sdk/client-s3"; // npm install it in your project
```

Only your task code is bundled. Imports are left alone and resolved from your
own `node_modules` at run time, so the version you installed is the version
that runs.

### What a task can export

| Export | Is | |
| --- | --- | --- |
| `timing` | cron pattern | required for `ngn run` |
| `task` | `async (ctx) => result` | required |
| `overlap` | `"skip"` \| `"allow"` | what a tick does while the last run is still going ([more](#when-a-run-is-still-going)) |
| `budget` | duration | the longest a run should take ([more](#how-long-a-run-has)) |
| `retry` | `{ attempts, delay, breaker }` | retry a failed run inside its tick ([more](#when-a-run-fails)) |
| `exclusive` | lock name or names | locks held for the whole run ([more](#keeping-tasks-out-of-each-others-way)) |
| `shouldSkip`, `shouldRetry`, `onSuccess`, `onError`, `onComplete` | hooks | [below](#hooks) |

A duration is milliseconds or a string: `"500ms"`, `"30s"`, `"4m"`, `"2h"`,
`"1d"`. A bad value fails when the task is scheduled, with the task's name, not
on its first tick.

### What `ctx` carries

| Member | |
| --- | --- |
| `log.info/warning/error(text)` | log lines, stored with the run |
| `timing.start(label)` | returns a function that records how long since |
| `kv.get/set/delete(key)` | small values that outlive runs, per task |
| `sqlite` | the task's own database ([more](#storing-data-with-ctxsqlite)) |
| `run` | this run's id, deadline and abort signal ([more](#how-long-a-run-has)) |
| `queue(name, options)` | a job queue ([more](#queues)) |
| `lock(name, fn, options)` | a named lock shared with other tasks ([more](#keeping-tasks-out-of-each-others-way)) |
| `env` | the variables from `envFile` |
| `meta` | the task file's path and ids |

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
| `batch(statements)` | Several statements in one transaction. |
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

Two tasks in one folder that open the same file share it, which is how they
share a queue.

A task can only reach databases inside its own folder. Absolute paths and paths
that climb out with `..` are rejected, so one task's data cannot be opened or
deleted by a task sitting in a different folder. Subfolders of the task's own
folder are fine.

Connections are held open between runs and closed when `ngn` shuts down.

### Hooks

Five more optional exports run around `task`. Each one gets the same `ctx`:

| Export | Runs |
| --- | --- |
| `shouldSkip` | Before `task`. Returning `true` skips the run — no other hook fires. |
| `onSuccess` | After `task` resolves. |
| `onError` | After `task` throws, with the error. The error is still rethrown. |
| `onComplete` | After success or failure. Not called on a skipped run. |
| `shouldRetry` | After a failure that `retry` would retry, with the error. Returning `false` gives up until the next tick. |

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

## Scheduling

### When a run is still going

A tick can arrive before the previous run has finished. By default ngn does not
start a second run beside it: it records the tick as a `skipped` run, with
`skip_reason = 'previous run still in progress'`, and waits for the next one.

```ts
export const timing = "*/5 * * * *";
export const overlap = "allow"; // start another run anyway
```

| `overlap` | A tick during a run |
| --- | --- |
| `"skip"` (default) | is recorded as skipped; nothing of the task runs, `shouldSkip` included |
| `"allow"` | starts a second run beside the first |

### How long a run has

`ctx.run` says when this run's slot ends, so a task that works through a backlog
can stop taking on more before the next tick, and leave the rest for it:

```ts
export const timing = "*/5 * * * *";

export const task = async (ctx: TaskContext) => {
  for (const item of await loadBacklog()) {
    if (ctx.run.signal.aborted) break; // the slot is nearly over
    await process(item);
  }
};
```

| Member | Is |
| --- | --- |
| `id` | this run's `task_runs.id` |
| `scheduledAt` | when the tick fired, epoch ms |
| `nextAt` | when the next tick is due |
| `deadline` | when to stop starting new work |
| `signal` | an `AbortSignal` that fires at `deadline`; pass it to `fetch` and friends |

The deadline is a tenth of the period before the next tick, and never more than
five seconds before it. `export const budget = "2m"` brings it closer.
`ngn run:once` has no next tick, so it gets a deadline only from a budget. The
signal is a request: ngn does not stop a run that ignores it.

### When a run fails

`retry` retries a failed run inside its tick, but never into the next one: a
retry that would not start before the next tick is left to that tick instead.
Each attempt is its own run, with `retry_of` pointing at the tick's first.

```ts
export const timing = "*/10 * * * *";
export const retry = {
  attempts: 3, // tries per tick, the first included
  delay: "30s", // before each retry
  breaker: { after: 5, maxSkip: 16 },
};

// Optional: the last word on each retry
export const shouldRetry = async (error: Error) => !error.message.includes("401");
```

`breaker` stops a task that keeps failing from failing on every tick. After
`after` ticks in a row that failed, ngn skips the next tick, then lets one
through; if that fails too it skips two, then four, up to `maxSkip` (32 by
default). One tick that succeeds closes it. Skipped ticks are recorded with
`skip_reason = 'circuit open after repeated failures'`. The streak is read from
the run history, so restarting `ngn run` does not reset it. Only scheduled ticks
are held back: `ngn run:once` always runs.

## Queues

A task that finds work and a task that does it can share a queue. ngn keeps the
queue in a table next to your own data (`_ngn_jobs`, in whichever database you
open it on), and handles the parts that are easy to get wrong:

- two runs, or two processes, never take the same job;
- a failed job backs off until the next tick instead of being retried at once,
  and is `dead` after `maxAttempts`;
- a job held by a run that died becomes available again once its lease runs out;
- the worker stops taking jobs before the next tick, and leaves the rest for it.

```ts
// tasks/collect.ts: every 2 minutes, find pages
export const timing = "*/2 * * * *";

export const task = async (ctx: TaskContext) => {
  const db = await ctx.sqlite.initDB({ file: "pages.db" });
  const pages = await ctx.queue<{ url: string }>("pages", { db });

  const links = await findLinks();
  // A key already in the queue, in any state, is not added again.
  const added = await pages.add(
    links.map((url) => ({ key: url, group: new URL(url).host, payload: { url } })),
  );
  return { found: links.length, added };
};
```

```ts
// tasks/read.ts: every 5 minutes, read as many as fit
export const timing = "*/5 * * * *";

export const task = async (ctx: TaskContext) => {
  const db = await ctx.sqlite.initDB({ file: "pages.db" });
  const pages = await ctx.queue<{ url: string }>("pages", { db, maxAttempts: 3 });

  return pages.work(
    async (job) => {
      await read(job.payload.url); // return to complete it, throw to fail the attempt
    },
    { concurrency: 4, perGroup: 10 },
  );
};
```

Both tasks open the same file from the same folder, so they share the queue.

### Working a queue

`work()` claims a few jobs at a time and stops taking new ones at
`ctx.run.deadline`, finishing the ones in hand. It never works two jobs of one
group at once (one site, one account), and it spreads each run across groups
instead of draining one. It returns a summary; return that from `task` and every
run records how the queue is doing:

```ts
{ done, failed, dead, released, remaining, oldestAgeMs, stoppedGroups, stoppedBy }
```

| Option | Does |
| --- | --- |
| `concurrency` | jobs worked at once (1) |
| `max` | most jobs this call takes |
| `perGroup` | most jobs one group gives this call: a number, or `(group) => number` for a cap per group |
| `until` | stop time, an `AbortSignal` or epoch ms (`ctx.run.signal`) |
| `worker.setup(index)` / `worker.teardown(resource)` | a resource per worker, made on its first job, so an empty queue costs nothing. Write `(index: number) =>` if you take the index, so TypeScript can carry the resource's type to the handler |

The handler gets the job and a handle:

| Handle | |
| --- | --- |
| `resource` | what `worker.setup` returned |
| `release({ delay, refund })` | hand this job back unworked, by default without spending its attempt |
| `stopGroup({ delay, refund })` | the same for every job of this group, for the rest of the call |
| `signal` | the `until` signal |

A browser-backed worker, with a bot wall that stops the whole site:

```ts
// One browser for every worker, launched by whichever worker needs it first.
let browser: Promise<Browser> | null = null;

const summary = await pages.work(
  async (job, { resource: page, stopGroup }) => {
    const result = await extract(page, job.payload.url);
    if (result.blocked) return stopGroup(); // every page on this site would say the same
    await save(result);
  },
  {
    concurrency: 4,
    worker: {
      setup: async () => (await (browser ??= launch())).newPage(),
      teardown: (page) => page.close(),
    },
  },
);
await (await browser)?.close();
```

### The queue itself

| Method | Does |
| --- | --- |
| `add(job \| jobs)` | `{ key, group, payload, priority, delay, maxAttempts }`; returns how many were new |
| `addStatement(job)` | the same INSERT as a statement, for your own `batch` |
| `claim({ limit, perGroup, skipGroups })` | take due jobs yourself, when `work()` does not fit |
| `complete(job)` / `fail(job, error)` / `release(job)` | settle a claimed job; false if its lease ran out and it moved on |
| `park(filter, reason)` / `reopen(filter, { from })` | set ready jobs aside and bring them back |
| `prune({ olderThan })` | delete old `done` jobs, freeing their keys |
| `get(key)` / `stats()` | one job, or counts by status and the oldest wait |

`addStatement` is how a job goes in the same transaction as the row it is about,
so there is never a row without its job or a job without its row:

```ts
await db.batch([
  { sql: "INSERT INTO listings (url) VALUES (?)", args: [url] },
  queue.addStatement({ key: url, group: host, payload: { url } }),
]);
```

`park` and `reopen` take `{ group, groupNotIn, key }`. Park what nothing can
work yet, and reopen it once something can:

```ts
await queue.reopen({ group: SUPPORTED_HOSTS }); // a new extractor just landed
await queue.park({ groupNotIn: SUPPORTED_HOSTS }, "no extractor");
await queue.reopen({}, { from: ["dead"] }); // retry what gave up
```

Queue options:

| Option | Default | |
| --- | --- | --- |
| `db` | `ctx.sqlite` | any `initDB` database |
| `maxAttempts` | 3 | tries before a job is `dead` |
| `backoff` | `"next-tick"` | when a failed job may run again: `"next-tick"`, a duration, or `{ base, max }` to double each time |
| `lease` | `"10m"` | how long a claim lasts before the job counts as abandoned; it has to outlast a run |

A job's `status` is one of `ready`, `leased`, `done`, `dead` or `parked`.
`ngn sql --db tasks/pages.db "SELECT status, COUNT(*) FROM _ngn_jobs GROUP BY 1"`
shows a queue from the terminal.

## Keeping tasks out of each other's way

Two tasks that must not work on the same thing at once can share a lock, by
name. Locks live in ngn's database, so they also hold against `ngn run:once` in
a second terminal.

```ts
// Hold a lock around part of a run. Waits for it, until the run's deadline.
export const task = async (ctx: TaskContext) => {
  await ctx.lock("site:example.com", async () => {
    await scrape("https://example.com");
  });
};
```

```ts
// Or hold it for the whole run. A run that cannot have it is recorded as
// skipped, with the lock's name, and the next tick tries again.
export const exclusive = ["browser"];
```

`ctx.lock(name, fn, options)` takes `wait` (`true` by default, `false`, or a
duration) and `ttl`: how long the lock outlives a process that died holding
it, one minute by default. It is renewed while held. When it cannot be had in
time it throws a `LockBusyError`; check `error.name === "LockBusyError"`.

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
ngn sql "SELECT id, skip_reason FROM task_runs WHERE status = 'skipped' ORDER BY id DESC"
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

## Upgrading from 0.2.x

- **Overlapping runs are skipped by default.** A task that relied on a second
  run starting while the first was still going needs `export const overlap = "allow"`.
- **`shouldRetry` is called now**, as `(error, ctx)`, and only when `retry`
  allows a retry. It was declared before but never called.
- **The run database is migrated** the first time `ngn run` (or `run:once`)
  opens it: `task_runs` gains `result`, `retry_of` and `skip_reason`, and a
  `locks` table appears. `ngn_migrations` records what was applied. `ngn sql`
  and ngnui read old and new files alike.
- **Cron runs on [croner](https://croner.56k.guru/)** instead of node-cron.
  The same five- and six-field patterns are accepted.
