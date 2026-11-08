# @apisurf/ngnui

## 0.5.0

### Minor Changes

- Interval timing, and one scheduling engine for every task.

  - `timing` takes a period as well as a cron pattern: `{ every: "5m" }` runs on a fixed grid (the leading edge, the default), `{ every: "5m", edge: "trailing" }` measures from the end of the last run. `ngn run x --timing 5m` does the same from the command line.
  - Each task's schedule is a state machine stored in the run database (`schedules`), with every transition written to `schedule_events` in the same transaction. Restarts pick up where they left off: an interval task catches up once after downtime, a cron task skips to its next slot.
  - `ngn schedule <task>` prints a task's state, next run and why, and its log. `ngn status` gains a "next" column, and `ngn show` prints the decision made after a run. ngnui describes interval timings in words.
  - A failing interval task backs off on its own: `every × factor^failedInARow`, within `[min, max]` and with jitter, back to `every` after one success. `timing` takes `min`, `max` and `backoff` (`{ factor, jitter }` or `false`); `ngn status` shows why a next run is when it is.
  - An interval task can choose its own next run with a `next` hook, from how its tick went: a duration, `"every"`, `"min"`, `"max"` or `{ in, reason }`, kept within `[min, max]`. A hook that throws, returns something else or takes over 5 seconds is recorded in a new `next` stage and the policy decides. `ngn show` and `ngn schedule` say who decided. `NextOutcome`, `NextDecision` and `IntervalTiming` are exported from `@apisurf/ngn`.
  - `ngn pause`, `ngn resume` and `ngn next <task> <now|duration>` hold, release or move any scheduled task from the terminal, without a restart; a running `ngn run` picks the change up within seconds. A pause or move during a run applies when it ends. `ngn status` shows paused tasks and mentions them in the verdict without failing.
  - ngnui shows when each task runs next and why: a next column on the Overview, the next run and who chose it in the task header, the decision on each run's page, and a Schedule tab with the state and log. Paused tasks are marked and never counted as unhealthy. With a live `ngn run` (which now serves `POST /api/schedule` and says `schedule: true` in `/api/meta`), the header has Pause, Resume and Run next; without one it shows the command.
  - A per-task lease means a task never runs beside itself, in any process on the database: Run now and `ngn run x --once` refuse with the id of the run in progress, two `ngn run` processes start each due run once, and a process that dies has its runs recovered by the next one.

  **Behaviour changes for cron tasks:**

  - A tick that comes due during a run no longer records a skipped run ("previous run still in progress"); the next run takes the first slot after the run ends, and the decision says it overran.
  - `overlap: "allow"` fails at schedule time.
  - Ctrl-C waits up to 10 seconds for runs in progress, then closes them as failed in a new `interrupted` stage; a second Ctrl-C exits at once.
  - Lock names starting with `ngn:` are reserved: `exclusive` and `ctx.lock` refuse them.
  - The breaker and its skipped runs are unchanged. Croner runs no timers any more; ngn uses it only to work out a pattern's next date.

## 0.4.0

### Minor Changes

- ngnui takes the layout lessons from wireui.

  - **Calmer colour.** Colour now means "look here": runs that succeeded are grey dots and grey bars, INFO lines are grey ticks, and the Overview says all is well in plain text. Red, amber and blue are kept for failures, warnings or Stalled runs, and runs still going.
  - **One header band.** A task's header and its tabs sit on one raised band that the page scrolls under. The header says how the task is doing in words, now **Healthy** too, not only Failing, Circuit open or Stalled.
  - **Run page.** Above a run, the task shrinks to one line that links back to it, and the run is the title: `Run #41 ✓ Succeeded`. Its figures read as one line (when, how long, log lines with their warnings and errors, timed spans, version) in place of stat cards. The breadcrumb is gone; that line is the way back.
  - **Timeline filters.** All, Logs or Timings, each with its count, plus **Problems only** for warnings and errors.
  - **Lighter Runs pages.** The filter and the facets share one toolbar row, the facets are drawn as segmented groups, and the time chart is slimmer. A task's Runs tab leads with its record in one line instead of stat cards.
  - **Description tab.** A task's page opens on the Markdown file beside it (`sync.md` for `sync.ts`) when there is one.
  - **Run now.** A task's header starts a run of it now, in the running `ngn run` (new `POST /api/run`, reported by `/api/meta` as `run: true`). It runs like a tick, except the breaker does not hold it back. While a run is still going it is refused rather than recorded as a skip.
  - **Request guard.** ngnui answers only to loopback Host names. Starting anything (the Editor or Run now) needs the same Origin and a token the server mints at start.

  ngn-core: `TaskLibraryScheduler.runNow(path)`. A run's deadline signal no longer fires 1 ms in on tasks scheduled more than ~24.8 days apart, such as monthly or yearly tasks; the timer used to overflow.

## 0.3.1

### Patch Changes

- Say what failed, and where.

  - A run that throws records it: an error line `Failed in <stage>: <error>`, with the stack frames inside the task, which `ngn show`, `ngn logs` and ngnui's run page lead with. The stage is `load` (the file threw while it was evaluated, or exports no `task`), `start` (the breaker or `exclusive` locks), `shouldSkip`, `task`, `record` (storing the result), or a hook. Before, ngn recorded that a run failed and not what it threw.
  - `ngn run` prints one line per problem, with its stage and what was thrown: `failed  tasks/x.ts #41 in task: TypeError: … → ngn show 41`. `ngn run --once` and editor runs add the frames. A task file that does not compile, and so has no run, is printed with the error rather than only its name.
  - A run whose `shouldSkip` throws, or whose breaker or lock check fails, is ended as failed. It used to stay `pending` for good.
  - A task file that throws while loading, or exports no `task` function, is a failed run in `load` with the module's own error. It used to fail with no run and "Entry failed to get exports".
  - An error thrown by `onSuccess`, `onError` or `onComplete` is recorded on the run and printed, and no longer changes the run's outcome: a succeeded run stays succeeded (it used to be reported as failed while its row said succeeded), and `onError` throwing no longer replaces the task's error.
  - An editor run no longer closes the databases of scheduled runs that are still going. It used to close every task database in the process when it finished, so a scheduled run in progress failed on its next query.
  - `ctx.env` is `{}` when there is no env file, instead of `null`, so `Object.keys(ctx.env)` (in the editor's own starter code) no longer throws.
  - An editor run that throws comes back to the editor as a failure, with its stage, instead of as a `null` result. Editor runs no longer add a pair of signal handlers to the `ngn run` process each time.
  - `@apisurf/ngn-core` exports `runFailure(error)` (the run and stage an error was recorded under), `releaseTaskDatabases(taskSourcePath)` and the `RunProblem` and `RunStage` types; `createControlsGenerator` takes a `report` callback. `@apisurf/ngn-schema/describe` adds `failureLine`, `readFailureLine`, `errorSummary` and `errorFrames`.

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

- 67e2209: Publish the `ngnui` dashboard as `@apisurf/ngnui`.

  `ngnui` serves a prebuilt web UI over an ngn database file: tasks, runs, logs,
  timings, stored keys, versions, a SQL console and the live task editor. It is
  now on npm and versioned in lockstep with `@apisurf/ngn`:

  ```bash
  npx @apisurf/ngnui --db ./ngn.sqlite
  ```

  `ngn run` and `ngn --help` no longer call it a separate paid module; they say
  where to install it from.

- ui lib

## 0.0.1

### Patch Changes

- Improvements
