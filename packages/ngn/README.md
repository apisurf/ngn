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
ngn init # initialize ngn inside current folder (runs are kept in ./ngn.sqlite)
ngn add test.ts # add a task file
ngn run # start running all tasks (blocks until Ctrl-C)
ngn run test.ts # run a subset: task names, or quoted globs
ngn run test.ts --once # run one task now, then exit
ngn run test.ts -t "*/2 * * * * *" # schedule one task on your own pattern
ngn run test.ts -t 5m # or every five minutes
ngn status # is anything wrong: the verdict, then each task's health and next run
ngn schedule test # when a task runs next, why, and what happened to its schedule
ngn runs --status failed --since 24h # run history, filtered
ngn show 41 # one run: why, its logs, timings and result
ngn logs scrape --level warn # a task's log lines across its runs
ngn ui # open the dashboard on this project (ngn ui 41 opens run 41)
ngn sql "SELECT * FROM task_runs ORDER BY id DESC LIMIT 20" # query a run history
```

## Writing a task

A task file exports `timing` — a cron pattern, or an interval — and `task`.
Everything else is optional.

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
five, minutes first (`"*/5 * * * *"`). Or a period, `{ every: "5m" }`, when
"every five minutes" is what you mean ([more](#cron-patterns-and-intervals)).
Whatever `task` returns is recorded with the run, as JSON in `task_runs.result`.

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
| `timing` | cron pattern, or `{ every, edge, min, max, backoff }` | required for `ngn run` ([more](#cron-patterns-and-intervals)) |
| `task` | `async (ctx) => result` | required |
| `budget` | duration | the longest a run should take ([more](#how-long-a-run-has)) |
| `retry` | `{ attempts, delay, breaker }` | retry a failed run inside its tick ([more](#when-a-run-fails)) |
| `exclusive` | lock name or names | locks held for the whole run ([more](#keeping-tasks-out-of-each-others-way)) |
| `shouldSkip`, `shouldRetry`, `onSuccess`, `onError`, `onComplete` | hooks | [below](#hooks) |
| `next` | `(outcome, ctx) => when` | an interval task picks its own next run ([more](#choosing-the-next-run)) |

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
| `env` | the variables from `envFile`; `{}` when there is none |
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
| `shouldSkip` | Before `task`. Returning `true` skips the run — no other hook fires. Throwing fails the run. |
| `onSuccess` | After `task` resolves. |
| `onError` | After `task` throws, with the error. The error is still rethrown. |
| `onComplete` | After success or failure. Not called on a skipped run. |
| `shouldRetry` | After a failure that `retry` would retry, with the error. Returning `false` gives up until the next tick. |

An error thrown by `onSuccess`, `onError` or `onComplete` is recorded on the run
(`Failed in onSuccess: …`) and printed, but does not change how the run ended:
a run whose `task` succeeded stays succeeded, and a failed run keeps the error
`task` threw rather than the hook's.

```ts
import { TaskContext } from "@apisurf/ngn";

export const timing = "*/5 * * * * *";

export const task = async (ctx: TaskContext) => {
  const end = ctx.timing.start("fetch");
  const html = await fetch("https://example.com").then((res) => res.text());
  await end();

  return { length: html.length };
};

// Skip the run entirely — nothing below this fires. (To hold a task for a
// while, `ngn pause` does it without recording a skip on every tick.)
export const shouldSkip = async (ctx: TaskContext) => {
  return (await ctx.kv.get("maintenance")) === "1";
};

export const onSuccess = async (ctx: TaskContext) => {
  await ctx.log.info("scrape ok");
};

// ngn records the error with the run either way; this is for reacting to it
export const onError = async (error: Error, ctx: TaskContext) => {
  await ctx.log.error(`scrape failed: ${error.message}`);
};

// Cleanup — runs after both success and failure
export const onComplete = async (ctx: TaskContext) => {
  await ctx.kv.set("last-run", new Date().toISOString());
};
```

## Scheduling

### Cron patterns and intervals

`timing` is either a cron pattern or a period. Both run on the same engine; the
only difference is where a task's slots come from.

```ts
export const timing = "0 */5 * * * *"; // on the pattern: :00, :05, :10…
export const timing = { every: "5h" }; // every five hours, from the first run
export const timing = { every: "5m", edge: "trailing" }; // five minutes after each run ends
```

A pattern like `0 */5 * * *` does not quite mean "every five hours": the gap
from 20:00 to midnight is four. `{ every: "5h" }` does. An interval task runs
as soon as it is first scheduled, then every `every` on one of two edges:

| `edge` | Runs | Pick it when |
| --- | --- | --- |
| `"leading"` (default) | on a fixed grid, `every` apart from the planned start of the last run. A 5-hour task that takes 20 minutes still starts at 00:00, 05:00, 10:00 | the task should keep a rhythm: reports, syncs, health checks |
| `"trailing"` | `every` after the last run ended, retries included | the task drains a queue and should rest a full period after it finishes |

`every` is a duration of at least `1s`. A typo (an unknown key, `"5 minutes"`)
fails when the task is scheduled, naming the task. Switching a task between a
pattern and an interval needs a restart of `ngn run`.

A run that ends past its slot (on the leading edge, or on a pattern) is
followed by the first slot after it ended. Missed slots are neither run
back to back nor recorded as skipped runs; the decision says how far over it
ran: `ran 1h12m past its slot; next slot 15:00`, or for a pattern
`ran past 2 slots; next 15:00`.

### One run at a time

A task never has two runs going at once, however they were started: by its
schedule, by Run now in ngnui, by `ngn run x --once` in another terminal, or by
a second `ngn run` on the same database. Every start goes through the task's
lease in the `locks` table (named `ngn:task:<path>`; lock names starting with
`ngn:` are ngn's own, and `exclusive` and `ctx.lock` refuse them).

- A run that comes due while another is going waits for it, then starts. Nothing
  is recorded as skipped.
- Run now and `--once` refuse while a run is going, naming it — `run 41 of
  tasks/scrape.ts is in progress` — and write nothing.
- Two `ngn run` processes on one database start each due run once between them.
- A process that dies mid-run holds its lease for one minute. The next process
  to look then closes its open runs as failed, in stage `interrupted`, and
  decides the next run as for a failed one.

**The one limit:** a process frozen for longer than a minute (a stuck event
loop, a database it cannot reach) can find, when it wakes, that another process
recovered its task and started a new run. Its own run's signal aborts with
`the run lost its lease`, its decision is thrown away, and `ngn schedule` shows
`lease lost` on one side and `recovered` on the other. That is the only way two
runs of a task can overlap.

`overlap: "allow"` fails at schedule time. `overlap: "skip"` is still accepted
and changes nothing.

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
| `scheduledAt` | when the run was planned for, epoch ms |
| `nextAt` | when the next run is due; null on the trailing edge |
| `deadline` | when to stop starting new work |
| `signal` | an `AbortSignal` that fires at `deadline`, or when ngn stops; pass it to `fetch` and friends |

On a pattern or the leading edge, the deadline is a tenth of the period before
the next slot, and never more than five seconds before it. On the trailing
edge, whose next run depends on when this one ends, it is `every` from the
start. `export const budget = "2m"` brings it closer either way.
`ngn run --once` has no next run, so it gets a deadline only from a budget. The
signal is a request: ngn does not stop a run that ignores it.

### When a run fails

`retry` retries a failed run inside its tick, but never into the next one: a
retry that would not start before the next slot is left to that slot instead.
On the trailing edge only `attempts` bounds it. Each attempt is its own run,
with `retry_of` pointing at the tick's first.

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

An interval task that keeps failing slows down on its own instead, and speeds
back up after one success. After each tick, the default policy picks the delay:

| The tick | Next run |
| --- | --- |
| succeeded, or was skipped (`shouldSkip`, a busy lock) | `every` (the next grid slot on the leading edge) |
| failed | `every × factor^failedInARow`, capped at `max`, give or take `jitter` of it, from when it ended |

```ts
export const timing = {
  every: "5m",
  min: "15s", // the shortest delay a run may choose; default: every
  max: "2h", // the longest delay anything may choose; default: every × 32
  backoff: { factor: 2, jitter: 0.1 }, // the default; false keeps failures on every
};
```

The jitter keeps tasks that fail together from all coming back at the same
moment. The streak is read from the run history, so restarting `ngn run` does
not reset it, and ticks closed as `interrupted` count as failures. On the
leading edge, the run after a backoff starts a new grid. `min` is at least
`1s`, and `min ≤ every ≤ max` must hold; ngn checks both at schedule time,
naming the task. The decision says what happened, in `ngn status`, `ngn show`
and ngnui: `backing off after 3 failures in a row: 40m`.

### Choosing the next run

An interval task can decide when it runs next from what its run found, with a
`next` hook. A queue worker that stopped at its deadline with a backlog comes
back at `min`; one that found the queue empty goes to `max`:

```ts
import type { NextOutcome, TaskContext } from "@apisurf/ngn";

export const timing = { every: "5m", min: "15s", max: "2h" };

export const task = async (ctx: TaskContext) => {
  const jobs = await ctx.queue<{ url: string }>("jobs");
  // Works until the queue is empty or the run's deadline; `stoppedBy` says which.
  const { stoppedBy, remaining } = await jobs.work(async (job) => read(job.payload.url));
  return { stoppedBy, remaining };
};

export const next = ({ status, result, error }: NextOutcome) => {
  if (status === "failure") return error.message.includes("429") ? "max" : undefined;
  if (result.stoppedBy === "deadline") return { in: "min", reason: `${result.remaining} jobs left` };
  if (result.remaining === 0) return "max";
};
```

It is a hook rather than something `task` calls, because a task that threw
never gets to call anything, and failures are when the decision matters most.
ngn calls it after every scheduled tick, after `onComplete`, with the final
attempt's `ctx` and:

| Field | Is |
| --- | --- |
| `status` | `success`, `failure` or `skipped` |
| `result` | what `task` returned, on success |
| `error` | what the final attempt threw, on failure |
| `skipReason` | why ngn skipped it; null for `shouldSkip` |
| `failedInARow` | the failure streak, this tick included |
| `previousDelayMs` | the delay that led to this tick |
| `runId` | the tick's final run |

It returns one of:

- `undefined`: the default policy decides (`every`, or backoff after a failure)
- a duration (`"30s"`, `90_000`), from when the tick ended
- `"every"`, `"min"` or `"max"`; `"every"` on the leading edge is the next grid slot
- `{ in, reason }`: either of the above, with a reason that is stored and shown

ngn keeps the delay within `[min, max]` and says so in the reason
(`1s kept to min 15s`). On the leading edge, anything but `"every"` starts a new
grid. A hook that throws, returns something else, or takes longer than 5
seconds is recorded on the run in stage `next` (`Failed in next: …`), and the
default policy decides; the run's outcome does not change. The hook runs while
the tick still holds the task, so the 5 seconds also cap how long it can keep
it. It is not called for a run ngn interrupted or recovered, nor for Run now or
`--once`, which do not move the next run. `next` on a cron task fails at
schedule time. `ngn show` says who decided: `Then: next run 15:05, set by the
next hook: 312 jobs left`.

### When a cron task keeps failing

`breaker` stops a cron task that keeps failing from failing on every tick.
After `after` ticks in a row that failed, ngn skips the next tick, then lets one
through; if that fails too it skips two, then four, up to `maxSkip` (32 by
default). One tick that succeeds closes it. Skipped ticks are recorded with
`skip_reason = 'circuit open after repeated failures'`. The streak is read from
the run history, so restarting `ngn run` does not reset it. Only scheduled ticks
are held back: `ngn run --once` always runs. For interval tasks, `backoff`
replaces the breaker: a `breaker` on an interval task fails at schedule time.

### Stopping and starting again

Each task's schedule lives in the run database, so restarting `ngn run` picks
up where it left off:

- **A next run still to come** is waited for.
- **One missed while ngn was not running:** an interval task runs once now (a
  catch-up, never one run per missed period), then carries on its grid. A cron
  task skips to its next slot, as cron always has.
- **A next run further off than the timing could choose** (the clock went
  back, `every` was shortened) is brought back in, and logged as `reclamped`.

Ctrl-C (or SIGTERM) stops `ngn run` starting runs, aborts the signal of every
run in progress and waits up to 10 seconds for them. A run that ends in time is
recorded as usual. One still going after that is closed as failed in stage
`interrupted` ("ngn stopped before the run ended"), and is due again at once
next time. A second Ctrl-C exits straight away and leaves the run for the next
`ngn run` to recover.

### Pausing and moving a task

A person can hold a scheduled task, cron or interval, let it go again, or move
its next run, without editing the task file or restarting `ngn run`:

```bash
ngn pause scrape        # no new runs; a run in progress finishes
ngn resume scrape       # runs now if it came due while paused, otherwise at its next run
ngn next scrape now     # run as soon as possible
ngn next scrape 10m     # run in ten minutes, then the schedule takes over again
```

Each writes one change to the task's schedule in the database, with source
`cli`, so no live runtime is needed; a running `ngn run` picks it up within a
few seconds. Tasks are named the way `ngn run` takes them.

| Command | Waiting (or blocked) | During a run | Paused |
| --- | --- | --- | --- |
| `pause` | paused at once | pauses when the run ends | already paused |
| `resume` | not paused | not paused | resumed |
| `next` | moved | the run's own decision is replaced when it ends | refused: resume it first |

- **Paused** means nothing happens: no runs, no skipped rows, no hooks.
  `ngn run scrape --once` still runs it, because a person asked, and it stays
  paused. `ngn status` lists it as paused, and its verdict mentions it ("2
  paused") without counting it as a problem.
- **`ngn next` with a duration** isn't held to `min`, but is at least `1s`. On
  the leading edge the moved run starts a new grid; a cron task goes back to its
  pattern after it.
- **Resuming a cron task** that missed slots takes its next slot after now, as
  after downtime, instead of running at once.

This replaces reading a "paused" flag from `ctx.kv` in `shouldSkip`, which
recorded a skipped run on every tick.

### What the schedule is doing

Every change to a task's schedule is written to a log, in the same transaction
as the change, so every gap between two runs has an explanation:

```bash
ngn status            # a "next" column: in 4m, running, blocked, overdue, and why when it's not the schedule
ngn schedule scrape   # its state, next run and why, then each step of its log
ngn show 41           # "Then: next run 15:05:00: every 5 minutes"
```

A schedule is in one of four states — `waiting`, `blocked` (due, but another
run holds the task), `running`, `paused` — and moves between them by events:
`scheduled`, `started` (scheduled, catch-up or manual), `decided`, `ended` (a
manual run; the next run stays put), `overdue`, `reclamped`, `interrupted`,
`blocked`, `superseded`, `recovered`, `lease_lost`, and from the commands above
`paused`, `pause_requested`, `resumed`, `rescheduled` and `override_requested`. They are in the
`schedules` and `schedule_events` tables for `ngn sql`, all with `--json`.

ngnui shows the same in the same words: a next column on the Overview (why on
hover), the next run and who chose it in a task's header, what was decided
after each run on its page, and a task's state and log on its Schedule tab.
Paused tasks are marked in the sidebar and never counted as unhealthy. With a
live `ngn run`, the header has Pause, Resume and Run next, which make the same
changes as the commands above; without one, it shows the command to run.

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
name. Locks live in ngn's database, so they also hold against `ngn run --once` in
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
Names starting with `ngn:` are ngn's own (each task's lease is one) and are
refused.

## Reading what your tasks did

Runs, logs and timings go into one SQLite file — whatever `dbPath` in
`ngn.config.ts` points at. `ngn init` writes `file:./ngn.sqlite`. A config
without `dbPath`, or with `":memory:"`, keeps nothing once the process exits.

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

There are three ways to read that file, and none needs the scheduler running.

**With the read commands** — the same answers ngnui gives, in the same words,
with `--json` on each for scripts and agents:

```bash
ngn status                                  # verdict + one row per task; exits 2 if unhealthy
ngn runs "task:extract status:failed since:24h"   # or --task, --status, --since…
ngn show 41                                 # why it failed or skipped, then logs, timings, result
ngn logs extract --level warn               # a task's lines across runs, or a run's by id
```

`ngn runs` takes the filter language ngnui's Runs page uses: `key:value` tokens
(`task`, `status`, `origin`, `since`, `until`, `version`), a leading `-` to
exclude, and plain words to match task paths. A run that has no end and is long
past its window reads as **Stalled** in all of them.

### When a run fails

ngn records what a run threw, and where, as an error line on the run, which
`ngn show`, `ngn logs` and ngnui all read:

```
Failed in task: TypeError: Cannot convert undefined or null to object
    at task (evalmachine.<anonymous>:30:75)
```

The word after `Failed in` is the stage it was thrown in:

| Stage | Is |
| --- | --- |
| `load` | evaluating the task file, or an export that is missing or invalid |
| `start` | ngn's checks before the task: the breaker, `exclusive` locks |
| `shouldSkip` | the task's `shouldSkip` |
| `task` | the task itself |
| `record` | storing what the task returned |
| `interrupted` | ngn closed the run: it stopped before the run ended, or the process running it died |
| `onSuccess`, `onError`, `onComplete` | a hook; recorded, the run's outcome stands |

Its first line is what `ngn show` leads with. The frames under it stop where
ngn called the task. Line numbers are in the compiled code, which
`file_task_versions.compiled_code` holds for each version. `ngn run` prints one
line per problem as it is recorded:

```
failed  tasks/collect.ts #41 in task: TypeError: Cannot read … → ngn show 41
warn    tasks/collect.ts #42: onSuccess threw Error: mail server down → ngn show 42
```

`ngn run --once` and editor runs add the frames. A task file that does not
compile has no run to record on, and is printed with what the compiler said.

```bash
ngn logs collect --level error              # every failure of one task, with its stage
ngn runs "status:failed since:24h"
```

**From the terminal, in SQL** — `ngn sql` takes any query SQLite accepts and prints a
table, or `--json` / `--csv`. Rows go to stdout and counts to stderr, so piping
into `jq` works. It opens the file without migrating it, so a query can never
change the schema. `ngn help schema` (or `ngn sql --help`) lists the tables and their columns.

```bash
ngn sql "SELECT status, COUNT(*) FROM task_runs GROUP BY status"
ngn sql "SELECT * FROM logs WHERE status = 'error' ORDER BY id DESC" --json
ngn sql "SELECT id, skip_reason FROM task_runs WHERE status = 'skipped' ORDER BY id DESC"
```

**In a browser** — [`@apisurf/ngnui`](https://www.npmjs.com/package/@apisurf/ngnui)
is a separate CLI that serves a prebuilt dashboard over the same file:

```bash
ngn ui        # the project's own ngnui, else one on PATH, else npx
ngn ui 41     # straight to run 41
```

It starts in the project folder with the database chosen. The editor in that UI
needs a runtime to execute against, which only a running `ngn run` has; ngnui
finds it on the config's `port` and connects whenever one is up.

## Upgrading from 0.4.x

Every task, cron or interval, now runs on one engine that keeps its schedule in
the database. For cron tasks that changes a few things on purpose:

| Before | Now |
| --- | --- |
| A tick during a run was recorded as a skipped run, "previous run still in progress" | No skipped row: the next run takes the first slot after the run ends, and the decision says it overran |
| `overlap: "allow"` started a second run beside the first | Fails at schedule time, naming the task: one run at a time holds for every task |
| Ctrl-C left runs in progress marked `running` | Runs get 10 seconds to end, then are closed as failed in stage `interrupted` |
| A process that died left its runs open | The next process recovers them |
| `--once` and a second `ngn run` could overlap a scheduled run | Both go through the task's lease |

The breaker and its skipped runs are unchanged, and so are the "circuit open"
health and the words for old "still running" skips. Missed ticks while ngn was
down are still not caught up for cron tasks; they are now logged as `overdue`.
The database gains `schedules`, `schedule_events` and two `task_runs` columns,
`next_at` and `next_reason`, the first time `ngn run` opens it. ngnui shows
the new runs in the same words.

## Upgrading from 0.2.9

- **`ngn init` writes `dbPath: "file:./ngn.sqlite"`** instead of `":memory:"`,
  so a new project keeps its runs and `ngn sql` and ngnui have something to read.
  Existing configs are not touched. Pass `--db :memory:` to get the old default.
- **One `run` command.** `ngn run <task> --once` is what `ngn run:once` was, and
  `ngn run <file> --timing <cron>` is what `ngn run:single` was, except that it
  now uses the project's config, env and database, so its runs are recorded; add
  `--no-config` for the old behaviour. Tasks are named as arguments
  (`ngn run scrape.ts api/**`) rather than with `--match`. The old forms still work.
- **`ngn init`'s flags are kebab-case and named like everywhere else:** `--db`
  (was `--dbFile`), `--port` (was `--apiPort`), `--config` (was `--configFile`)
  and `--env-file` (was `--envFile`). The old names still work.

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
