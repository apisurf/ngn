# Tree test: proposed ngnui navigation

For ticket 19 (`DEV/tickets/ia-redesign/19-tree-test-the-navigation.md`). Ticket 20 waits on the result.

## How to run it

1. Show a participant **only the tree below**, as text: no screenshots and no UI.
2. Read one task at a time. Ask them to point at the place they would go first, then where they'd end up. Don't help.
3. Record their first click and final answer per task in the results table.
4. Run with at least two people who have used ngn. Optionally also run it with an agent given only this file and one task at a time.

A task passes when the final answer is the expected node. "First click right" counts on its own, because a wrong first click means the label didn't carry.

## The proposed tree

This is the navigation ticket 20 would build: one sidebar column, global pages on top, the project's tasks below, and a ⌘K palette.

```
ngnui
├── Overview                      verdict, Needs attention, every task's schedule and health
├── Runs                          every run; filter bar (task: status: origin: since: until:),
│                                 counts per status/origin, chart to drag a time window
├── Editor                        write code, run it once against ngn run; Recent runs
├── Tasks
│   ├── <task>                    header: schedule, settings, health
│   │   ├── Runs                  the Runs view scoped to this task, under its figures
│   │   │   └── <run #>           why (failed / skipped / stalled), then:
│   │   │       ├── Timeline      log lines and timings on one clock
│   │   │       ├── Logs
│   │   │       ├── Timings
│   │   │       ├── Result        what the task returned
│   │   │       └── Details       ids, version, times, locks
│   │   ├── Logs                  every line it wrote, across runs
│   │   ├── Timings
│   │   ├── Keys                  its ctx.kv values
│   │   └── Versions              each build of the file and its code
│   └── …
├── ⌘K palette                    jump to a task, a run by number, a page; Follow; theme
├── Top bar: Follow · Refresh · Settings (theme, database path)
└── Status bar: live runtime · N running · N stalled (each a link to Runs, filtered)
```

## Tasks

| # | Task (read aloud) | Expected answer |
| --- | --- | --- |
| 1 | `extract.ts` skipped its last tick. Where do you find out why? | Tasks › extract.ts › Runs › the skipped run (its reason, and a link to the run that blocked it) |
| 2 | Someone mentions run 41. Where do you open it? | ⌘K palette, typing `41` (also accepted: Runs, filtered or scrolled) |
| 3 | Is any task stuck right now? | Overview (verdict and Needs attention), or the status bar's "stalled" link |
| 4 | What has `collect.ts` stored between runs? | Tasks › collect.ts › Keys (renamed Stored values after this test) |
| 5 | You want to try some code against the project's real config and env. | Editor |
| 6 | Which runs failed yesterday afternoon, across every task? | Runs, filtering `status:failed` and dragging the chart (or `since:`/`until:`) |
| 7 | What did run 12 return? | Tasks › its task › Runs › run 12 › Result (or ⌘K `12` › Result) |
| 8 | Where do you see the full path of the database ngnui is reading? | Top bar › Settings |

## Results

**Run on 2026-11-05 with three AI agents, not people.** Each was a fresh agent (Sonnet, Haiku, Opus) that saw only a stricter, labels-only version of the tree (no descriptions), one sentence on what ngn is, and the eight tasks. None saw the expected answers. This is a proxy: it tests whether the labels lead somewhere on their own, not how ngn's own users think. Run it with two people who use ngn before treating it as settled.

| # | Sonnet: first click → answer | Haiku: first click → answer | Opus: first click → answer | Pass | Confident |
| --- | --- | --- | --- | --- | --- |
| 1 | Tasks → extract.ts › Runs › the skipped run | Tasks → extract.ts › Logs | Tasks → extract.ts › Logs, then Runs | 1/3 | 0/3 |
| 2 | ⌘K → run 41 | ⌘K → run 41 | ⌘K → run 41 | 3/3 | 3/3 |
| 3 | Status bar → N stalled | Status bar → N stalled | Status bar → N stalled → Runs | 3/3 | 2/3 |
| 4 | Tasks → collect.ts › Keys | Tasks → collect.ts › Keys | Tasks → collect.ts › Keys | 3/3 | 0/3 |
| 5 | Editor | Editor | Editor | 3/3 | 0/3 |
| 6 | Runs, filtered | Runs, filtered | Runs, filtered | 3/3 | 3/3 |
| 7 | Runs › #12 › Result | ⌘K → #12 › Result | ⌘K → #12 › Result | 3/3 | 3/3 |
| 8 | Top bar › Settings | Top bar › Settings | Top bar › Settings | 3/3 | 0/3 |

What they said about the labels:

- **Keys** (all three): it could mean API keys or secrets. Nothing says it holds what a task stored.
- **Editor** (all three): it doesn't say it runs code against the project's real config and env. One read it as "edit the task files".
- **A skipped tick** (task 1): two of three assumed a skip leaves no run behind and looked in Logs, where ngn's own skip lines are hidden by default.
- **The database path** (task 8): all three guessed Settings; the status bar's "runtime" competed. Nothing visible says "database".
- **Versions** (two of three): file history, or the ngn version? No task tested it.

## Decision note

Build ticket 20 as written. No participant got lost in the one-column structure: every global answer started at the right top-level item, and ⌘K and the status bar were found at once. The weak spots are labels and scent, so ticket 20 also does these:

1. **Keys → Stored values.** The tab says what is in it; `ctx.kv` stays in its empty state. The glossary is updated.
2. **The Editor says what it does.** The navigation item's tooltip and the page's own header both read: run code once in this project's `ngn run`, with its config and env.
3. **The task header shows the latest run's outcome**, a skip with its reason and a link to the run, so "why did it skip" starts on the task and not in its Logs.
4. **The database name in the top bar opens Settings**, where the full path is.

Left as is: **Versions** (no task tested it; revisit if people stumble on it), and the tab strip, which the test did not cover and which ticket 20 makes opt-in.
