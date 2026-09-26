# ngnui

A local browser UI for the database [ngn](https://www.npmjs.com/package/@apisurf/ngn) records its runs into, laid
out the way wireui is: tasks down the left, open tabs across the top, and each
run shown with its logs and timings on one clock. Everything in it is read-only
except the live editor, which does not run anything itself — it hands the code
to a running `ngn run`.

```bash
ngn run      # schedules tasks, writes dbPath from ngn.config.ts
ngnui        # reads it (run from the same project folder)
```

```
  ngnui

  open       http://127.0.0.1:3000
  database   /Users/you/work/project/ngn.sqlite
  live       off — pass --live <url of a running ngn run> to enable the editor

  Ctrl-C to stop.
```

## Install

```bash
npm install -g @apisurf/ngnui    # then run `ngnui`
npx @apisurf/ngnui               # or without installing
```

It needs Node 20.12 or newer. `better-sqlite3` is its one runtime dependency and
installs a prebuilt native binary for your platform.

## Usage

```bash
ngnui                                          # dbPath from ./ngn.config.ts, port 3000
ngnui --db ~/work/ngn.sqlite                   # another file
ngnui --live http://127.0.0.1:4545             # enable the live editor
ngnui --port 4000                              # another port
```

`ngn run` prints the exact command for its project when it starts, `--live`
included.

| Flag              | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--db <path>`     | Database file to read. Default: `dbPath` from `./ngn.config.ts`, else `./ngn.sqlite` |
| `--live <url>`    | The `ngn run` live endpoint the editor sends code to. Without it the editor is off  |
| `--port <n>`      | Port to serve on. Default `3000`                                                   |
| `-h`, `--help`    | Show help                                                                          |
| `-v`, `--version` | Show the version                                                                   |

Without `--db`, the config's `dbPath` is read as text — nearly every config states
it as a string literal. A computed one falls back to `./ngn.sqlite`, and a config
on `:memory:` is reported rather than opened, since nothing was kept. Without
`--port`, if `3000` is busy it takes the next free port up to `3020`. A file that
does not exist yet is not an error: the UI starts empty and fills in once
`ngn run` writes to it.

## What you get

```
┌ ngnui / ngn.sqlite                                     [● Live] ⟳ ◫ ☾ ┐
├──────┬──────────────────────┬────────────────────────────────────────┤
│ ▣    │ Tasks                │ Overview ×  sync-users.ts #41 ×  SQL × │
│ Task │ tasks/api/           ├────────────────────────────────────────┤
│ ◷    │ ▾ sync-users.ts  ● 41│ ● sync-users.ts #41  Failed  v2        │
│ Hist │     ● 18:09  412 ms  │ The task failed: upstream returned 503 │
│ ≡    │     ● 18:06  388 ms  │ Timeline  Logs  Timings  Code  Details │
│ Logs │ ▸ health.ts       603│ +0 ms   TIME  fetch   ████████         │
│ ⌂ </>│ Live editor          │ +294 ms TIME  write           ██       │
│ ⛁    │ ▸ Run at 18:56:04   1│ +368 ms ERROR sync failed: …        ▏  │
└──────┴──────────────────────┴────────────────────────────────────────┘
```

**The sidebar** has three panels:

- **Tasks.** Every task file, grouped by its folder, with its recent runs under
  it. Code sent from the live editor is recorded as a task too; those are grouped
  at the bottom and named by when they ran.
- **History.** Every run of every task, newest first, under day headings. Search
  by task path, narrow to failed, skipped or running, and hide the editor's runs.
- **Logs.** Every line every task wrote, newest first, searchable by message or
  task path, filterable by level. ngn's own lifecycle lines (`Task started`,
  `Task succeeded`, …) are hidden unless asked for.

**Tabs** work as in wireui: a single click opens a _preview_ tab (italic) that the
next single click reuses; double-click a tab or a sidebar row to keep it.
Middle-click closes a tab. Each tab remembers its sub-tab.

**A task** shows its schedule — the `timing` export, read out of the newest
compiled version and put into words when it is a common shape — and which hooks
it exports. Its tabs are:

- **Runs**: success rate, median and p95 duration, a bar per run, and the history
- **Timings**: each `ctx.timing` label's count, average, p50, p95, max and trend
- **Logs**: every line it wrote, across runs
- **Store**: its `ctx.kv` keys as they stand now, JSON pretty-printed
- **Versions**: each distinct build of the file, how its runs went, and its code

**A run** leads with its verdict. A failed run shows the last error the task
logged — ngn records that a run failed, not what it threw, so this is whatever an
`onError` hook wrote. The tabs are:

- **Timeline**: log lines and timing spans on one clock, with a waterfall
- **Logs**: the run's lines, filterable, with JSON messages opening into a tree
- **Timings**: spans folded by label, then every span
- **Code**: the exact version that ran, as source or as stored
- **Details**: every field of the row

`[` and `]` step to the previous or next run of the same task and keep the same
tab open.

**Overview** gives totals for the file, runs per hour over the last day, failing
tasks, recent warnings and errors, recent runs and the slowest tasks. **SQL** is
`ngn sql` in the browser: a schema browser (click a column to insert it), example
queries, and results capped at 1,000 rows. The query is kept in the URL.

**Live editor** sends a task to `ngn run`, which compiles it with the project's
config and env, runs it once and records it. The result sits beside the code — side
by side or stacked, per the layout toggle — along with the run it recorded and
that run's logs. The draft is kept in the browser.

**Live** in the top bar re-reads the file every two seconds. The UI also re-reads
whenever you switch back to its tab. Themes are light, dark or system.

## Notes

- **It only reads.** The database is opened `readonly` and `query_only`, so neither
  the pages nor the SQL console can change it. SQLite refuses the write, not a check
  in this code.
- **The editor executes nothing here.** Code goes to the `--live` URL given at
  start-up, and only there — the browser cannot point it anywhere else.
- **It is local.** The server binds to `127.0.0.1`. The database holds whatever
  your tasks logged and stored.
- **One file, one process.** No daemon, and it writes no state of its own to disk.
  Layout preferences and the editor draft live in the browser's localStorage.

## From a checkout

```bash
pnpm install
pnpm --filter @apisurf/ngnui build     # produces packages/ui/dist
pnpm ngnui --db /path/to/ngn.sqlite --live http://127.0.0.1:4545
```

For working on the UI itself, run the Vite dev server against a file:

```bash
NGN_DB=/abs/path/ngn.sqlite NGN_LIVE=http://127.0.0.1:4545 pnpm ui
```

`NGN_DB` must be an absolute path, because the dev server runs with `packages/ui`
as its working directory.

Stack: TanStack Start (React 19, file routes, server functions) on Vite with a Nitro
`node-server` build, Panda CSS, better-sqlite3, TypeScript checked by `tsgo`,
linted with `oxlint` and formatted with `oxfmt` — the same setup as wireui. Every
dependency is pinned to an exact version. The tests build their fixture with
`@apisurf/ngn-persistence`, so a change to ngn's schema fails them. It is released
with the other `@apisurf/ngn*` packages — see `distribution/README.md`.
