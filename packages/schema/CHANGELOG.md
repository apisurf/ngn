# ngn-schema

## 0.3.0

### Minor Changes

- Information architecture pass over the CLI and the dashboard.

  - `ngn init` writes `dbPath: "file:./ngn.sqlite"` by default, so a new project keeps its run history. `--db :memory:` keeps the old behaviour.
  - `ngn run --match` and `ngn run:once` take a task the way you'd name it: `scrape.ts` or `scrape` finds `tasks/scrape.ts`. A name that fits several tasks lists them, and a name that fits none suggests the nearest ones. `ngn run` with a name that matches nothing now exits instead of scheduling nothing.
  - ngnui finds the project's `ngn run` without `--live`: it reads `port` from `./ngn.config.ts` and connects the editor when a runtime there serves the same database. `ngn run`'s `/api/meta` now reports the database it serves.
  - `@apisurf/ngn-schema/describe`: the rules that turn ngn's rows into words (run status, skip reasons, log levels, task paths, a task's schedule and settings read from its compiled code, durations). ngnui uses it, and the CLI will, so both say the same thing. Durations now read in hours and days past an hour (`3h 12m`, `8d 14h`).
  - ngnui uses one word per thing: **Follow** (was Live) re-reads the file, **Runs** (was History, and `/history` still opens it) lists every run, **Keys** (was Store) holds a task's `ctx.kv` values, and the **Editor** and its **editor runs** drop "live". Logs comes before Timings on task and run pages, and a task's Logs tab shows a count.
  - A run page opens on its most useful tab (a failed run on its logs, a quiet one on its result), dims tabs with nothing in them, and folds figures it did not record into one line. The Overview leaves out its 24-hour chart when there were no runs.
  - `ngn init` takes `--db`, `--port`, `--config` and `--env-file`, matching `ngn sql` and ngnui. `--dbFile`, `--apiPort`, `--configFile` and `--envFile` still work.
  - ngnui calls a run with no end **Stalled** once it is twice past the longer of its task's budget and schedule, or at once when a lock it held stopped being renewed. Stalled runs show in the Overview verdict and Needs attention, on the task, in the sidebar (which now shows a health mark instead of a run count) and in the status bar. A run skipped because the last one was still going links to that run.
  - Editor runs are runs, not tasks: they leave the Tasks sidebar and the task count, the Editor page lists them under **Recent runs**, their pages lead back to the Editor, and Runs filters by origin (scheduled or editor) instead of "Hide editor runs".
  - ngnui's top bar holds the file name, Follow, Refresh and a settings menu (theme, the database's full path). The Editor's layout toggle moved into the Editor. The status bar shows only system state: the live runtime, and running and Stalled counts that link to Runs filtered to them. Runs filters by Stalled.
  - One `run` command: `ngn run [task…]` schedules, `ngn run <task> --once` runs one now, and `ngn run <file> --timing <cron>` schedules one file on your pattern using the project's config, env and database (`--no-config` for the old, record-nothing behaviour). `run:once`, `run:single` and `--match` still work.
  - `ngn --help` fits on one screen, grouped into Set up, Run and Inspect. Reference moved to topics: `ngn help task | config | ctx | queue | schema`, and `ngn help --all` prints everything for a reader that reads once.
  - `ngn run` says what it scheduled: each task with its schedule in words, and any task it could not schedule with the reason. The endpoint line is labelled "runtime". `TaskLibraryScheduler.start()` now returns that report.
  - `ngn ui [run]` starts ngnui on the project's database (the project's own install, else one on PATH, else npx) and opens the browser, on one run when given its id. The `ngn run` readout points at it.
  - Read commands that answer what ngnui answers, in its words, each with `--json`: `ngn status` (the verdict and every task's health; exits 2 when unhealthy), `ngn runs` (run history filtered by `--task/--status/--origin/--since/--until` or the Runs page's token language, `"task:extract status:failed since:24h"`), `ngn show <run>` (why it failed or skipped, then logs, timings, result) and `ngn logs <task|run>`. A failed scheduled run prints `failed  <task> #<id> → ngn show <id>`.
  - `@apisurf/ngn-schema/describe` also carries the filter language (`parseRunQuery`), the verdict, run explanations and time phrasing, shared by ngnui and the CLI. `@apisurf/ngn-core` adds `failedRunId(error)` and an `onRunError` option on `TaskLibraryScheduler`.
  - ngnui has a command palette (⌘K / Ctrl-K): jump to a task, a run by number or a page, and toggle Follow or the theme. `/` only focuses the page's own filter.
  - The Runs page filters with one bar in the `ngn runs` language, with suggestions and removable chips, shows how many runs each status and origin would give, keeps the filter in the URL as `q`, and copies it as an `ngn runs` command.
  - A task's Runs tab is the Runs view scoped to that task: the same filter bar (with `task:` fixed), facet counts and rows, under the task's own figures, and an "Open in Runs" link that carries the filter across.
  - The Runs page has a chart of runs over time under the current filter; dragging across it narrows the list by writing `since:` and `until:` into the filter.
  - ngnui has one navigation column: Overview, Runs and Editor on top of the task list, collapsing to a strip of icons. Page headers are breadcrumbs (`Tasks / extract.ts / Run #2`). The tab strip is off by default and comes back with "Keep pages open as tabs" in Settings. After a tree test: a task's "Keys" tab is now **Stored values**, the Editor says what it does, a task's header names its latest run when it did not succeed (with the skip reason), and the database name in the top bar opens Settings.

## 0.2.9

### Patch Changes

- Simplify ui

## 0.2.8

### Patch Changes

- Extend tasks runtime API

## 0.2.7

### Patch Changes

- UX improvements

## 0.2.6

### Patch Changes

- ui lib

## 0.2.5

### Patch Changes

- Improvements

## 0.2.4

### Patch Changes

- docs update

## 0.2.3

### Patch Changes

- Release procedure and docs update

## 0.2.2

### Patch Changes

- 26ad08b: Publish the four libraries ngn is built from, and drop the dashboard from this
  repository.

  `ngn-core`, `ngn-os`, `ngn-persistence` and `ngn-schema` were private to the
  workspace. They are now `@apisurf/ngn-core`, `@apisurf/ngn-os`,
  `@apisurf/ngn-persistence` and `@apisurf/ngn-schema`, published on npm and
  versioned in lockstep with `@apisurf/ngn`. Anything that wants to read an ngn
  database — `@apisurf/ngn-schema` is the table shape — can now depend on the
  same definitions the scheduler uses instead of restating them.

  `@apisurf/ngn` depends on them normally rather than inlining them at build
  time, so `scripts/inject-dependencies.js` — which existed only to flatten the
  dependencies of packages that could not be installed from npm — is gone, and
  so are the five flattened entries it added to this package's manifest.

  **`@apisurf/ngn` is now ESM.** The libraries it depends on are ESM-only, so the
  CLI can no longer be built as CommonJS. Its `exports` map never offered a
  `require` entry, so `import { defineConfig } from "@apisurf/ngn"` is unchanged;
  a project reaching it through `require()` was relying on the bundle and needs
  to import it instead.

  The `ngnui` dashboard has moved to its own repository and is a paid module.
  `ngn run` and `ngn --help` say so where they mention it. Nothing about the
  database changed: `ngn sql` reads the same file and ships with `ngn`.

## 0.2.1

## 0.2.0

## 0.1.17

### Patch Changes

- Init package release

## 0.1.16

### Patch Changes

- Plugins v1 wrap up

## 0.1.15

### Patch Changes

- Add s3 plugin

## 0.1.14

### Patch Changes

- Split head UI

## 0.1.13

### Patch Changes

- sqlite plugin now offers multiple DB management from a single task

## 0.1.12

### Patch Changes

- Pass additional metadata to tasks

## 0.1.11

### Patch Changes

- package folders rename

## 0.1.10

### Patch Changes

- Plugin system

## 0.1.9

### Patch Changes

- updates

## 0.1.8

### Patch Changes

- Ouput correct package version

## 0.1.7

### Patch Changes

- Relase updates

## 0.1.6

### Patch Changes

- Update

## 0.1.5

### Patch Changes

- Small release updates

## 0.1.4

### Patch Changes

- Name revert; prep for github release

## 0.1.3

### Patch Changes

- Task dependencies structure change

## 0.1.2

### Patch Changes

- Fix globally exposed Node APIs

## 0.1.1

### Patch Changes

- Initial changeset
