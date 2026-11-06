# ngnui

A local browser UI for the database [ngn](https://www.npmjs.com/package/@apisurf/ngn) records its runs into, laid
out the way wireui is: tasks down the left, open tabs across the top, and each
run shown with its logs and timings on one clock. Everything in it is read-only
except the Editor and a task's **Run now**, which do not run anything themselves:
they ask a running `ngn run` to.

```bash
ngn run      # schedules tasks, writes dbPath from ngn.config.ts
ngn ui       # starts ngnui on it (or run `ngnui` from the same project folder)
```

```
  ngnui

  open       http://127.0.0.1:3000
  database   /Users/you/work/project/ngn.sqlite
  runtime    http://127.0.0.1:4545 (ngn 0.3.0)

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
ngnui --live http://127.0.0.1:4545             # name the ngn run the editor sends code to
ngnui --port 4000                              # another port
```

Run from the project folder, ngnui needs no flags. The database comes from
`dbPath` in `./ngn.config.ts`, and the editor's runtime from its `port`: ngnui
probes `http://127.0.0.1:<port>` and connects the editor when an `ngn run`
answers there serving the same database. It keeps checking, so starting `ngn run`
after ngnui works too. A runtime on that port that serves a different file is
refused rather than sent this project's code.

| Flag              | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--db <path>`     | Database file to read. Default: `dbPath` from `./ngn.config.ts`, else `./ngn.sqlite` |
| `--live <url>`    | The `ngn run` the editor sends code to. Default: the `port` in `./ngn.config.ts`, on 127.0.0.1 |
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
┌ ngnui / ngn.sqlite                                     [● Follow] ⟳ ⚙ ┐
├──────────────────────┬────────────────────────────────────────────────┤
│ ⌂ Overview           │ sync-users.ts                       ▷ Run now  │
│ ◷ Runs               │ Run #41  ✕ Failed                          ‹ › │
│ </> Editor           │ 27 Oct, 18:56 · took 1.2 s · 12 log lines · v2 │
│                      │ The task failed: upstream returned 503         │
│ Tasks                │ Timeline  Logs  Timings  Result  Details       │
│ tasks/api/           ├────────────────────────────────────────────────┤
│ sync-users.ts      ● │ +368 ms ERROR sync failed: …                ▏  │
│ health.ts            │                                                │
├──────────────────────┴────────────────────────────────────────────────┤
└ runtime 127.0.0.1:4545 · 1 stalled                         Read-only ┘
```

**The sidebar** is the one navigation column. On top are the pages — **Overview**,
**Runs** and **Editor** — and under them the project's task files, grouped by folder,
with a mark on any that needs looking at (failing, circuit open, or Stalled) and
nothing on the healthy ones. Editor runs are not listed as tasks; they are on the
Editor page and under Runs. The chevron collapses the sidebar to a strip that still
has the pages' icons, and expands it again.

- **Runs.** Every run of every task, newest first, under day headings, with one
  filter bar that takes the language `ngn runs` takes: `task:extract status:failed
  since:24h`, `-status:skipped` to exclude, plain words for task paths. Keys and
  their values are suggested as you type, and each token becomes a removable chip.
  Under it, every status and origin shows how many runs picking it would give;
  click one to narrow to it. The filter is kept in the URL as `q`, and **Copy as
  ngn runs** gives the same filter for the terminal. Above the list, a chart of runs
  over time (under every filter but the time ones, in bars from a minute to a week
  wide) narrows the list to whatever you drag across: the drag writes `since:` and
  `until:` into the filter, and **Every time** clears them. The old `/history` URL
  still opens it.

Above the list, the filter and the facets share one toolbar row; the page has no
heading of its own, since the sidebar already says where you are.

**Colour** means "look here". A run that succeeded, a skip and an INFO line are
the normal case and are drawn in greys: grey dots in lists, grey bars in charts.
Red is a failure, amber a warning or a Stalled run, blue a run still going. Green
is kept for a verdict said in words, like a header's **Succeeded** or **Healthy**.

**⌘K** (Ctrl-K) opens a palette that jumps to a task by name, a run by its number
(`41` or `#41`) or a page, and toggles Follow or the theme. `/` focuses the page's own
filter where it has one.

**Tabs** are off by default: every view has its own URL, so the browser's tabs and
Back cover the same need. Turn on **Keep pages open as tabs** in Settings for a tab
strip that works as in wireui: a single click opens a _preview_ tab (italic) that the
next single click reuses; double-click a tab or a sidebar row to keep it. Middle-click
closes a tab. Each tab remembers its sub-tab.

**A task's header** is one raised band holding the task and its tabs, and the
page scrolls under it. It gives the task's health in words: **Healthy**, **Failing**,
**Circuit open** or **Stalled**. **Run now** asks the running `ngn run` to start a
run of the task straight away. It runs like a tick (retries, budget, locks, hooks),
except that the breaker does not hold it back. It is refused while a run of the task
is still going, and turns on Follow so the new run shows up as it goes. Without a
runtime the button is off and says why.

**A task** shows its schedule — the `timing` export, read out of the newest
compiled version and put into words when it is a common shape — and, under it,
whatever changes how ngn runs it: `retry` and its breaker, `budget`, `overlap`,
`exclusive` locks, and the hooks it exports. A task on the defaults shows none of
that line. A task whose latest run failed is marked **Failing**, and **Circuit
open** once its breaker is skipping ticks. When its latest run did not succeed, the
header says so — `latest #6 skipped: still running` — and links to it. Its tabs are:

- **Description**: the Markdown file beside the task (`sync-users.md` for
  `sync-users.ts`), rendered, as it is in the project now. The task opens here when
  it has one; without it the tab is dimmed and says where the file would go
- **Runs**: one line with its runs, success rate, retries, median and p95 duration,
  and how many were skipped and why; then a bar per run, and the Runs view scoped
  to this task — the
  same filter bar (with `task:` fixed), counts and rows, and **Open in Runs** to
  carry the filter to the Runs page; a row opens that run. A skipped
  run says why (`shouldSkip`, still running, circuit open, a busy lock) and a
  retried tick's runs are marked `try 2/3`
- **Logs**: every line it wrote, across runs
- **Timings**: each `ctx.timing` label's count, average, p50, p95, max and trend
- **Stored values**: what it keeps between runs with `ctx.kv`, as it stands now, JSON pretty-printed
- **Versions**: each distinct build of the file, how its runs went, and its code

**A run** opens under its task's header, shrunk to one line that links back to the
task (and keeps Run now). The run is the title, `Run #41`, with its verdict beside it
and its figures in one line under it: when it ran, how long it took, its log lines
with their warnings and errors, its timed spans and the version that ran. Anything
it did not record is said in that line rather than shown as zeros. A failed run shows what it threw and the
stage it was thrown in (`Failed in shouldSkip: …`), as ngn recorded it; a run from
before ngn recorded that shows the last error the task logged. A retried run lists every try of its tick, each a link, and
says whether a later one succeeded. A skipped run explains its `skip_reason`, and
one skipped because the last run was still going links to that run. A run with no
recorded end is **Stalled** once it is twice past the longer of its task's `budget`
and schedule (a day when neither can be read), or at once when a lock it held
stopped being renewed: the process running it is gone and ngn will not record an
end. Stalled runs show on their task, in the sidebar, in the status bar, and in the
Overview's verdict. It opens on its most useful tab: a failed run on its Logs, a run that
logged or timed something on its Timeline, a quiet one on its Result or Details.
Tabs with nothing in them are dimmed, and figures it did not record (no log lines,
no timings) fold into one line instead of cards of zeros. The tabs are:

- **Timeline**: log lines and timing spans on one clock, with a waterfall. **All**,
  **Logs** or **Timings** narrows it to one kind, each with its count, and
  **Problems only** to warnings and errors. ngn's own lifecycle lines are hidden
  until **Lifecycle** is on, here and in **Logs**
- **Logs**: the run's lines, filterable, with JSON messages opening into a tree
- **Timings**: spans folded by label, then every span
- **Result**: what `task` returned, as a JSON tree
- **Details**: the run's ids, version, times, attempt, skip reason and any lock it holds

The code that ran is not repeated: the run links to its version in the task's
**Versions** tab, and says so when the task has moved on since.

`[` and `]` step to the previous or next run of the same task and keep the same
tab open when that run has something there.

**Overview** opens with a one-line verdict — every task healthy, or what is wrong, stalled runs included —
and the last 24 hours in numbers. Under it, **Needs attention** lists each task whose
latest run failed (for how long, how many runs, the last error it logged, a link to
the failure), each Stalled run (since when, and how many ticks it has held back) and
any lock a stopped process left behind; it is not shown when there
is nothing to list. **Tasks** is one row per scheduled task: its schedule in words,
its latest runs as a strip of ticks, when it last ran, its average duration, and any
lock it holds now. Runs per hour over the last day close the page, when there were any. For anything the
pages do not answer, `ngn sql` queries the same file from the terminal.

**Editor** sends a task to `ngn run`, which compiles it with the project's
config and env, runs it once and records it. The result sits beside the code — side
by side or stacked, per the toggle in the Editor's toolbar — along with the run it recorded and
that run's logs. Before anything is run, and in a tab beside the result after,
**Recent runs** lists earlier editor runs, newest first; each opens its run page,
whose header leads back here. The draft is kept in the browser.

**The top bar** holds the database's file name (click it, or the settings button, for
its full path), **Follow**, Refresh and the settings menu: theme, tabs on or off, and
the database's path and size. **The status bar** is the
system's state: the live runtime, how many runs are going and how many are
Stalled (each a link to Runs filtered to them), and whether Follow is on.

**Follow** in the top bar re-reads the file every two seconds. The UI also re-reads
whenever you switch back to its tab. Themes are light, dark or system.

## Notes

- **Older files work.** A database last written by ngn 0.2.x has no
  `retry_of`, `skip_reason`, `result` or `locks`; those read as empty rather than
  failing, until the next `ngn run` migrates the file.
- **It only reads.** The database is opened `readonly` and `query_only`, so nothing in
  the UI can change it. SQLite refuses the write, not a check in this code.
- **The editor and Run now execute nothing here.** Code, or the path of a task to run,
  goes to the `--live` URL given at start-up, or the loopback port the config names,
  and only there. The browser cannot point them anywhere else.
- **It is local.** The server binds to `127.0.0.1`. The database holds whatever
  your tasks logged and stored, so every request whose `Host` is not `127.0.0.1`,
  `localhost` or `[::1]` is refused with a 403, which shuts out DNS rebinding.
  Starting anything (the Editor's Run, a task's Run now) also needs a same-origin
  request carrying a token the server minted at start and gave only to its own pages.
- **Descriptions come from the project.** A task's `.md` is read from the folder ngnui
  started in when it holds the config, else the database's folder, and never from
  outside it.
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
as its working directory. Task descriptions are read from the database's folder,
or from `NGN_ROOT` (absolute) when the project is elsewhere.

Stack: TanStack Start (React 19, file routes, server functions) on Vite with a Nitro
`node-server` build, Panda CSS, better-sqlite3, TypeScript checked by `tsgo`,
linted with `oxlint` and formatted with `oxfmt` — the same setup as wireui. Every
dependency is pinned to an exact version. The tests build their fixture with
`@apisurf/ngn-persistence`, so a change to ngn's schema fails them. It is released
with the other `@apisurf/ngn*` packages — see `distribution/README.md`.
