# ngn-core

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

### Patch Changes

- Updated dependencies
  - @apisurf/ngn-persistence@0.5.0
  - @apisurf/ngn-schema@0.5.0
  - @apisurf/ngn-os@0.5.0

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

### Patch Changes

- @apisurf/ngn-os@0.4.0
- @apisurf/ngn-persistence@0.4.0
- @apisurf/ngn-schema@0.4.0

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

- Updated dependencies
  - @apisurf/ngn-schema@0.3.1
  - @apisurf/ngn-os@0.3.1
  - @apisurf/ngn-persistence@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies
  - @apisurf/ngn-schema@0.3.0
  - @apisurf/ngn-os@0.3.0
  - @apisurf/ngn-persistence@0.3.0

## 0.2.9

### Patch Changes

- Simplify ui
- Updated dependencies
  - @apisurf/ngn-os@0.2.9
  - @apisurf/ngn-persistence@0.2.9
  - @apisurf/ngn-schema@0.2.9

## 0.2.8

### Patch Changes

- Extend tasks runtime API
- Updated dependencies
  - @apisurf/ngn-os@0.2.8
  - @apisurf/ngn-persistence@0.2.8
  - @apisurf/ngn-schema@0.2.8

## 0.2.7

### Patch Changes

- UX improvements
- Updated dependencies
  - @apisurf/ngn-os@0.2.7
  - @apisurf/ngn-persistence@0.2.7
  - @apisurf/ngn-schema@0.2.7

## 0.2.6

### Patch Changes

- ui lib
- Updated dependencies
  - @apisurf/ngn-os@0.2.6
  - @apisurf/ngn-persistence@0.2.6
  - @apisurf/ngn-schema@0.2.6

## 0.2.5

### Patch Changes

- Improvements
- Updated dependencies
  - @apisurf/ngn-os@0.2.5
  - @apisurf/ngn-persistence@0.2.5
  - @apisurf/ngn-schema@0.2.5

## 0.2.4

### Patch Changes

- docs update
- Updated dependencies
  - @apisurf/ngn-persistence@0.2.4
  - @apisurf/ngn-schema@0.2.4
  - @apisurf/ngn-os@0.2.4

## 0.2.3

### Patch Changes

- Release procedure and docs update
- Updated dependencies
  - @apisurf/ngn-os@0.2.3
  - @apisurf/ngn-persistence@0.2.3
  - @apisurf/ngn-schema@0.2.3

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

- Updated dependencies [26ad08b]
  - @apisurf/ngn-os@0.2.2
  - @apisurf/ngn-persistence@0.2.2
  - @apisurf/ngn-schema@0.2.2

## 0.2.1

### Patch Changes

- ngn-os@0.2.1
- ngn-persistence@0.2.1
- ngn-schema@0.2.1

## 0.2.0

### Patch Changes

- ngn-os@0.2.0
- ngn-persistence@0.2.0
- ngn-schema@0.2.0

## 0.1.17

### Patch Changes

- Init package release
- Updated dependencies
  - ngn-os@0.1.17
  - ngn-persistence@0.1.17
  - ngn-schema@0.1.17

## 0.1.16

### Patch Changes

- Plugins v1 wrap up
- Updated dependencies
  - ngn-persistence@0.1.16
  - ngn-schema@0.1.16
  - ngn-os@0.1.16

## 0.1.15

### Patch Changes

- Add s3 plugin
- Updated dependencies
  - ngn-persistence@0.1.15
  - ngn-schema@0.1.15
  - ngn-os@0.1.15

## 0.1.14

### Patch Changes

- Split head UI
- Updated dependencies
  - ngn-persistence@0.1.14
  - ngn-schema@0.1.14
  - ngn-os@0.1.14

## 0.1.13

### Patch Changes

- sqlite plugin now offers multiple DB management from a single task
- Updated dependencies
  - ngn-persistence@0.1.13
  - ngn-schema@0.1.13
  - ngn-os@0.1.13

## 0.1.12

### Patch Changes

- Pass additional metadata to tasks
- Updated dependencies
  - ngn-persistence@0.1.12
  - ngn-schema@0.1.12
  - ngn-os@0.1.12

## 0.1.11

### Patch Changes

- package folders rename
- Updated dependencies
  - ngn-persistence@0.1.11
  - ngn-schema@0.1.11
  - ngn-os@0.1.11

## 0.1.10

### Patch Changes

- Plugin system
- Updated dependencies
  - ngn-persistence@0.1.10
  - ngn-schema@0.1.10
  - ngn-os@0.1.10

## 0.1.9

### Patch Changes

- updates
- Updated dependencies
  - ngn-persistence@0.1.9
  - ngn-schema@0.1.9
  - ngn-os@0.1.9

## 0.1.8

### Patch Changes

- Ouput correct package version
- Updated dependencies
  - ngn-persistence@0.1.8
  - ngn-schema@0.1.8
  - ngn-os@0.1.8

## 0.1.7

### Patch Changes

- Relase updates
- Updated dependencies
  - ngn-persistence@0.1.7
  - ngn-schema@0.1.7
  - ngn-os@0.1.7

## 0.1.6

### Patch Changes

- Update
- Updated dependencies
  - ngn-persistence@0.1.6
  - ngn-schema@0.1.6
  - ngn-os@0.1.6

## 0.1.5

### Patch Changes

- Small release updates
- Updated dependencies
  - ngn-persistence@0.1.5
  - ngn-schema@0.1.5
  - ngn-os@0.1.5

## 0.1.4

### Patch Changes

- Name revert; prep for github release
- Updated dependencies
  - ngn-persistence@0.1.4
  - ngn-schema@0.1.4
  - ngn-os@0.1.4

## 0.1.3

### Patch Changes

- Task dependencies structure change
- Updated dependencies
  - ngn-persistence@0.1.3
  - ngn-schema@0.1.3
  - ngn-os@0.1.3

## 0.1.2

### Patch Changes

- Fix globally exposed Node APIs
- Updated dependencies
  - ngn-persistence@0.1.2
  - ngn-schema@0.1.2
  - ngn-os@0.1.2

## 0.1.1

### Patch Changes

- Initial changeset
- Updated dependencies
  - ngn-persistence@0.1.1
  - ngn-schema@0.1.1
  - ngn-os@0.1.1
