# Progress: IA redesign

As of 2026-11-05. **All 24 tickets are done**, staged on `main` and **not committed**.

**Ticket 19 was run with three AI agents, not people.** Fresh Sonnet, Haiku and Opus agents saw only a labels-only tree and the tasks. Results and the decision note are in `DEV/ia/tree-test.md`. It's worth repeating with two people who use ngn; the kit is ready for that.

## What landed

| # | Where to look |
| --- | --- |
| 01 | `DEV/ia/glossary.md`: objects, terms, status words, the Stalled rule, filter keys, top tasks |
| 02 | `ngn init` writes `file:./ngn.sqlite` |
| 03 | `matchTaskName` in the describe module (names), `packages/ngn/src/util/matchTasks.ts` (adds globs and suggestions) |
| 04 | `packages/ui/bin/ngnui.mjs` finds the runtime from the config's `port`. `/api/meta` reports `db`, and a runtime ngnui found itself is only trusted while that matches |
| 05 | `packages/ui/src/lib/run-tabs.ts`: the run page opens on its most useful tab |
| 06 | `@apisurf/ngn-schema/describe` (`packages/schema/src/describe/`): everything that turns rows into words, shared by ngnui and the CLI |
| 07 | Follow, Runs (`/history` redirects), Keys, Editor |
| 08 | `packages/ngn/src/program.ts`: every command and flag, testable with stub actions |
| 09 | Stalled: the rule is in `describe/stall.ts`, the UI's queries in `server/queries.ts` (`stalledRuns`, `blocked_by`) |
| 10 | Editor runs are runs. The Editor page has Recent runs |
| 11 | `components/settings-menu.tsx`. The status bar shows system state, with running/stalled links |
| 12 | `ngn run [task…]`, `--once`, `--timing` (keeps the config), `--no-config`. The old commands are hidden aliases |
| 13 | `packages/ngn/src/help.ts`: grouped overview, `help <topic>`, `help --all` |
| 14 | `TaskLibraryScheduler.start()` returns a `ScheduleReport`, and the readout lists tasks |
| 15 | `packages/ngn/src/cliCmd/ui.ts`: the project's ngnui, then PATH, then npx. A stop signal reaches the child |
| 16–18 | `packages/ngn/src/read/store.ts` (libsql) plus `cliCmd/status.ts`, `runs.ts`, `show.ts`, `logs.ts`. A failed tick prints `→ ngn show <id>`, through core's `failedRunId` and `onRunError` |
| 21 | `components/command-palette.tsx` (⌘K). `/` only focuses a page's own filter |
| 22 | `components/run-filter.tsx` (bar, chips, suggestions, facets) and `components/runs-view.tsx`. Shared grammar in `describe/query.ts`, SQL in `describe/query-sql.ts`. The URL keeps `?q=` |
| 23 | The task Runs tab is `RunsView` with `task:` locked, `lead` = the task's figures, and "Open in Runs" |
| 24 | `components/time-scrub.tsx`, `runActivity` in `server/queries.ts`, `withWindow` in `lib/runs-query.ts` |
| 19 | `DEV/ia/tree-test.md`: the kit, three agents' answers and the decision note. The structure held (7 of 8 tasks passed everywhere); the labels were weak |
| 20 | `components/shell.tsx`: one sidebar (`PageLinks` above the tasks, `CollapsedSidebar` keeps the page icons), and the tab strip behind `prefs.tabs` (off; switched in Settings). `components/breadcrumb.tsx` in the task, run and editor-run headers. From the test: **Stored values** (was Keys), the Editor's header and nav hint, the task header's latest-run line (`LatestRun`), and the database name opening Settings |

`.changeset/ia-redesign.md` lists every user-facing change: minor bumps for ngn, ngnui and ngn-schema. ngn-core changed too (`ScheduleReport`, `failedRunId`, `onRunError`), but the fixed group moves it with the rest.

## Checked

- `pnpm lint`, `typecheck`, `test` (schema 63, ngn 41, ngnui 49, core 82, persistence 4), `fmt:check` and `build` all pass.
- End to end in a scratch project:
  - `init` → `add` → `run`, and `ngn sql`/ngnui read the file.
  - ngnui with no flags connects to a running `ngn run`.
  - `run --once` and `run -t` both record their runs.
  - A failing tick prints the `ngn show` pointer.
  - `ngn ui` passes SIGTERM to its child, so no ngnui is left running.
- In the browser against `ngn-properties-mine/ngn.sqlite`:
  - Stalled shows everywhere it should.
  - The settings menu and the status bar links work.
  - The palette goes to a task and to a run number.
  - The Runs filter bar's suggestions, chips and facets work.
  - The task Runs tab has `task:` locked.
  - Dragging the chart writes `since:`/`until:`.

## Where the result differs from the ticket text

- **06:** the derivation tests live in `packages/schema/test/`. The glossary renames (`describeTask().live` → `.editor`, `pending` → "Running") meant they changed.
- **05:** the Result tab is always shown, dimmed when empty.
- **03:** `run` with a name that matches nothing exits 1, and `--once` with several matches lists them instead of running the first.
- **07:** the Editor's URL stays `/live`.
- **09:** durations drop zero parts (`5m`). An Overview verdict whose only problems are stalled runs or stale locks is amber.
- **13:** the Inspect group also lists `status`, `runs`, `show`, `logs` and `ui`, added by their tickets. The overview is 29 lines.
- **16:** `ngn status` exits 2 when the verdict names a problem and 1 when it can't read, so scripts can tell the two apart.
- **22:** the facet chips are the built-in views: Failed, Stalled, Skipped, Running, Succeeded, Scheduled, Editor runs. The old `status=` and `origin=` URL params convert to `q`.
- **20:** the "Tasks" breadcrumb links to the Overview, which lists every task, since there's no separate Tasks page. The test also renamed "Keys" to "Stored values" (glossary updated), so ticket 07's "Keys" no longer stands.
- **24:** the chart shows the whole span of matching runs and dims bars outside the window, rather than zooming in.

## Notes for what's left

- **Repeat the tree test with people** (`DEV/ia/tree-test.md`). Task 4's expected answer is now "Stored values". Watch whether "Versions" confuses anyone: two of the agents asked about it.
- The tab strip defaults to off for everyone, including people who used it before. "Keep pages open as tabs" in Settings brings it back.
- CLI and UI each have their own run SQL (async libsql in `read/store.ts`, sync better-sqlite3 in `server/queries.ts`). The filter SQL, Stalled rule and wording are shared through the describe module. A change to the run shape belongs in both stores.
- The ngnui launcher's runtime probe (`describeRuntime` in `bin/ngnui.mjs`) mirrors `probeLive` in the server. Keep the two in step.
- `workspaceCounts().tasks` still counts editor runs. The status bar no longer shows task counts, so nothing reads it.
- `tsgo` (`@typescript/native-preview`) crashed once with a segfault during `pnpm typecheck`. Re-running passed. If typecheck fails with module-not-found or `any` errors, run it again before chasing the code.
