# IA redesign: ngn CLI and ngnui

One object model and one vocabulary across the command line and the dashboard, health that reaches the top of the page, and less navigation machinery. Start with the [brief](brief.md). The full reasoning is in [`DEV/ia/plan.md`](../../ia/plan.md).

Tickets in dependency order (blockers first). **All 24 are done.** Ticket 19 was run with AI agents as a proxy and is worth repeating with people. See [progress.md](progress.md) for what landed and where to pick up.

| # | Ticket | Blocked by | Delivers |
| --- | --- | --- | --- |
| 01 | [Glossary and object model](01-glossary-and-object-model.md) | — | One name per concept, the object map and the top tasks, as the reference for every label |
| 02 | [`ngn init` records to a file by default](02-init-records-to-a-file.md) | — | New projects keep their run history, so `ngn sql` and ngnui work out of the box |
| 03 | [Forgiving task matching](03-forgiving-task-matching.md) | — | `scrape.ts` finds `tasks/scrape.ts`, and an ambiguous name lists its candidates |
| 04 | [ngnui finds the live runtime itself](04-ngnui-finds-the-live-runtime.md) | — | The Editor turns on without `--live` when `ngn run` is up |
| 05 | [Run page opens on what's there](05-run-page-opens-on-whats-there.md) | — | The default tab depends on content, and empty tabs, zero stats and the empty chart are hidden |
| 06 | [Shared run and task derivations](06-shared-run-and-task-derivations.md) | [01](01-glossary-and-object-model.md) | The rules that turn rows into words are shared by ngnui and the CLI (prefactor) |
| 07 | [UI vocabulary pass](07-ui-vocabulary-pass.md) | [01](01-glossary-and-object-model.md) | Follow, Editor, Keys and Runs everywhere, with the same tab order on task and run pages |
| 08 | [CLI flags in one style](08-cli-flags-in-one-style.md) | [01](01-glossary-and-object-model.md) | Kebab-case glossary flags, with the old ones kept as aliases |
| 09 | [Stalled runs](09-stalled-runs.md) | [06](06-shared-run-and-task-derivations.md) | Runs that will never finish are called Stalled, and that reaches the verdict, the status bar and the sidebar |
| 10 | [Editor runs are runs, not tasks](10-editor-runs-are-runs.md) | [07](07-ui-vocabulary-pass.md) | The Tasks sidebar lists only the project's tasks, and editor runs live on the Editor page and under the origin filter |
| 11 | [Top bar and status bar cleanup](11-top-bar-and-status-bar.md) | [07](07-ui-vocabulary-pass.md), [09](09-stalled-runs.md) | Controls sit next to what they affect, and the status bar shows system state with links |
| 12 | [One `run` command](12-one-run-command.md) | [03](03-forgiving-task-matching.md), [08](08-cli-flags-in-one-style.md) | `run [task…]`, `--once` and `--timing` replace `run:once` and `run:single` |
| 13 | [Help grouped by intent](13-help-grouped-by-intent.md) | [12](12-one-run-command.md) | One-screen help by intent, with `help <topic>` and `help --all` |
| 14 | [`ngn run` readout lists its tasks](14-run-readout-lists-its-tasks.md) | [06](06-shared-run-and-task-derivations.md) | Startup says what was scheduled and when it runs |
| 15 | [`ngn ui [run]`](15-ngn-ui.md) | [14](14-run-readout-lists-its-tasks.md) | One command opens the dashboard on this project, optionally on one run |
| 16 | [`ngn status`](16-ngn-status.md) | [09](09-stalled-runs.md) | The Overview's verdict and task health in the terminal |
| 17 | [`ngn runs`](17-ngn-runs.md) | [09](09-stalled-runs.md) | Run history filtered by flags or by the same token string as the UI |
| 18 | [`ngn show <run>` and `ngn logs`](18-ngn-show-and-logs.md) | [09](09-stalled-runs.md) | "Why did this fail?" answered in one command, with `ngn run` pointing at it |
| 19 | [Tree test the proposed navigation](19-tree-test-the-navigation.md) | [07](07-ui-vocabulary-pass.md) | Evidence for or against the navigation change (needs a person) |
| 20 | [One navigation column](20-one-navigation-column.md) | [10](10-editor-runs-are-runs.md), [19](19-tree-test-the-navigation.md) | The rail merges into the sidebar, tabs become opt-in, and headers become breadcrumbs |
| 21 | [Command palette (⌘K)](21-command-palette.md) | [07](07-ui-vocabulary-pass.md) | Jump to any task, run or page from the keyboard, and `/` means one thing |
| 22 | [Faceted Runs page](22-faceted-runs-page.md) | [10](10-editor-runs-are-runs.md), [17](17-ngn-runs.md) | A token filter bar with counts and preset views, sharing the CLI's grammar |
| 23 | [Task Runs tab reuses the Runs view](23-task-runs-tab-reuses-runs.md) | [22](22-faceted-runs-page.md) | One run list and one way to filter, at two scopes |
| 24 | [Time scrub on Runs](24-time-scrub-on-runs.md) | [22](22-faceted-runs-page.md) | Drag across the activity chart to narrow by time |

## Not in this set

- **Queue panel on the task page.** Queues live in each task's own database, which ngnui doesn't open today.
- **Locks page.** Worth it once locks see use beyond the two miners.
- **Recording how a run started** (scheduled or `--once`). Needs a core migration. Until then the `origin` filter only tells scheduled runs from editor runs.
- **Custom saved views.** There's little to save in a local, single-user tool.
