# Information architecture plan: ngn CLI and ngnui

Based on the IA reference (`IA Redesign for Agent API Tools.pdf`), a read of `packages/ngn` and
`packages/ui`, and ngnui run against `ngn-properties-mine/ngn.sqlite`.

## The core problem

Both surfaces are well made one screen at a time. Most of the friction comes from three things
underneath them:

1. **No shared object model.** The CLI's only read path is `ngn sql`, so reading from the terminal
   means learning the storage schema (`file_tasks`, `task_runs`, `kvs`). The UI is built from
   objects: tasks, runs, logs, timings, keys, versions. The two surfaces describe the same data
   in different terms.
2. **No controlled vocabulary.** One word covers several concepts, and one concept goes by several
   words. The worst case is "Live" (see below).
3. **State does not travel upward.** A problem deep in a run doesn't reach the task, the
   Overview verdict or the status bar, so they keep reporting that everything is fine.

The work is ordered around those three. Phase 0 is cheap, and every later phase depends on it.

---

## Phase 0: object model and glossary (no code)

*OOUX plus controlled vocabulary. The PDF's advice: define the objects before you sketch screens.*

### Objects

| Object | Belongs to | Key properties | Today in UI | Today in CLI |
| --- | --- | --- | --- | --- |
| Project | — | root, config, db, runtime port | top bar basename + status bar path | `ngn.config.ts` |
| Task | Project | path, schedule, behaviour (retry, budget, overlap, exclusive), hooks, **health** (derived) | sidebar + task page | only via SQL |
| Version | Task | n, hash, code | task › Versions | SQL |
| Run | Task | status, **origin** (scheduled / once / editor), attempt, skip reason, result | run page, History | SQL |
| Log line, Timing span | Run (rolled up to Task) | level, label, offset | run + task tabs | SQL |
| Key (`ctx.kv`) | Task | key, value, updated | "Store" tab | SQL (`kvs`) |
| Lock | Project, held by a Run | name, holder, lease | Overview rows, run Details | SQL |
| Queue / Job | task's own DB | status counts, oldest wait | **not shown** | `ngn sql --db tasks/x.db` |

Decision this enables: **an editor run is a Run with `origin: editor`, not a Task.** Today the
sidebar lists editor runs as tasks named "Run at 18:56:04"
(`packages/ui/src/components/sidebar-tasks.tsx`).

### Glossary: one word per concept

| Concept | Today | Proposed |
| --- | --- | --- |
| Auto re-read of the DB file | top-bar **Live** button, "● Live" in status bar | **Follow** |
| Connection to a running `ngn run` | `--live`, "live" line in the `ngn run` readout, "editor →" in status bar | **Live runtime** (keep `--live`; "live" means only this) |
| Code-and-run page | rail "Editor", tab "Live editor", sidebar group "Live editor" | **Editor**, and its runs are **editor runs** |
| `ctx.kv` values | tab "Store", table `kvs`, root README "stored keys" | **Keys** |
| Every run of every task | page "History"; the task's Runs tab also has a "HISTORY" heading | **Runs** (global), and the task tab is the same view scoped to one task |
| Database | config `dbPath`, `init --dbFile`, `sql --db`, `ngnui --db` | **`--db`** everywhere |
| Runtime port | config `port`, `init --apiPort`, readout "live" | **`--port`** |
| Run status | `success/failure/running/pending/skipped`; UI "Succeeded/Failed/Running/Skipped"; History filter id `open` | Fixed display words, the same in CLI and UI, plus a derived **Stalled** |
| Warn level | `ctx.log.warning()` and stored `warn` | Document as one level; accept both |

Write this up as `DEV/ia/glossary.md`. Every label, flag, help line and README heading below is
checked against it.

### Top tasks (task analysis)

These are the jobs the defaults should serve. Each phase is measured by the steps or commands
each job takes before and after.

1. Is anything broken right now?
2. Why did task X fail, or why isn't it running?
3. Is X stuck, and what is it blocking?
4. What did X return, store or log?
5. Try some code against the real config and env.
6. Set up a project so that 1–4 work at all.

---

## Phase 1: quick, high-value fixes

### 1.1 Stalled runs (information scent; state broadcast upward)

Seen in the properties DB: run #2 of `extract.ts` started on 27 Oct and has no end. It shows
**Running** with a duration of **"12381m 49s"**. Runs #4 and #6 are "Skipped — still running"
because of it. Meanwhile the Overview says **"All 2 tasks healthy"** and the status bar says
"1 running". The UI only reports "likely stopped" when the run held a lock whose lease has
expired (`tasks.$taskId.runs.$runId.tsx:406`).

- Derive **Stalled**: no end recorded, and the run is older than `max(budget, period between ticks,
  lock lease)` plus a margin. Show the pill as "Stalled", not "Running".
- Propagate it upward. The task gets a health mark in the sidebar, the Overview verdict reads
  "1 run stalled since 27 Oct · extract.ts skipping ticks" and the run appears under Needs
  attention, and the status bar splits the count into "running" and "stalled".
- In a "Skipped — still running" row, make the blocking run (`#2`) a link.
- Core option, separate: on startup, `ngn run` marks its own orphaned `running` rows as abandoned.

### 1.2 Human-scale durations

`formatMs` (`packages/ui/src/lib/format.ts:8`) stops at minutes. Add hours and days ("8d 14h").

### 1.3 Progressive disclosure on the run page

- The default tab depends on content. A failed run lands on Logs. A run that logged nothing
  lands on Result, or Details if there's no result. Today it can land on Timeline showing
  "Only ngn's lifecycle lines".
- Hide or dim tabs with no content ("Timeline 0", "Timings 0").
- Collapse zero-value stat cards ("Logs 0 · no warnings", "Timed spans 0") into one muted line.

### 1.4 Put controls next to what they affect (proximity)

- The editor layout toggle (side/stacked) sits in the global top bar but only affects the Editor.
  Move it into the Editor toolbar.
- Move Theme into a small settings menu. The top bar then holds project name, Follow and Refresh.
- The status bar repeats the DB path that the top bar already shows. Make the status bar about
  system state only: Follow state, live runtime, and running/stalled counts, where the counts
  link to filtered Runs.

### 1.5 Editor runs out of the task tree

The Tasks sidebar lists scheduled tasks only. Editor runs go in a "Recent runs" list on the
Editor page and in Runs with `origin: editor`. The existing "Hide editor runs" toggle becomes
that facet.

### 1.6 Consistent sibling order and labels

The task page tab order is Runs, Timings, Logs, Store, Versions. The run page order is Timeline,
Logs, Timings, Result, Details. Put Logs before Timings in both, rename Store to Keys, and give
every tab a count or none of them (today Logs has no count).

### 1.7 Remove empty chrome on the Overview

When the DaySummary line already says "No runs in the last 24 hours", hide the empty
"Last 24 hours" chart.

### 1.8 Sensible default database (`ngn init`)

`ngn init` writes `dbPath: ":memory:"` by default. With that default, `ngn sql`, ngnui and every
"read what your tasks did" job don't work, and the user only finds out later. ngnui's own fallback
is `./ngn.sqlite`, so the two surfaces disagree. Default to `file:./ngn.sqlite`, with
`--db :memory:` as the opt-out.

---

## Phase 2: CLI structure

### 2.1 Help grouped by intent, with reference behind topics

Today `ngn --help` is a single page (`packages/ngn/src/cli.ts:16`) mixing examples, the
task-file spec, config, `ctx.sqlite` and where results go. Split it up:

```
ngn — schedule TypeScript/JavaScript task files and record every run

Set up
  init                 create ngn.config.ts and tasks/
  add <name>           create tasks/<name> from a template
Run
  run [task…]          schedule matching tasks            (blocks)
  run <task> --once    run one task now, record it, exit
Inspect
  status               every task and its health
  runs [filters]       run history
  show <run>           one run: verdict, logs, timings, result
  logs <task|run>      log lines
  ui [run]             open the dashboard on this project
  sql <query>          anything else, straight SQL
Reference
  help task | config | ctx | queue | schema
  help --all           everything, for a reader who reads once
```

`help --all` keeps the current "read once, examples first" design for agents. Humans get a short
first screen.

### 2.2 Fewer verbs, clearer modifiers

| Today | Problem | Proposed (old names kept as hidden aliases) |
| --- | --- | --- |
| `run:once <pattern>` | "once" and "single" are near-synonyms | `run <task> --once` |
| `run:single <file> -t <cron>` | ignores config, `:memory:`, no env, which is surprising | `run <file> --timing <cron>`: overrides the timing, keeps the config. `--no-config` for today's behaviour |
| `run --match <glob>` vs `run:once <pattern>` | same idea, two shapes | positional `[task…]` on both; `--match` stays as an alias |

### 2.3 Forgiving task matching

Today the pattern has to include the directory: `"scrape.ts"` matches nothing (`cli.ts` help,
`runOnce.ts:20`). Resolve in this order: exact path, path under `tasks/`, then basename or
suffix. When a name is ambiguous, list the candidates. This is the CLI version of strong
information scent.

### 2.4 One flag style

Use kebab-case and the glossary names: `init --dbFile/--apiPort/--configFile/--envFile` becomes
`--db/--port/--config/--env-file`, matching `sql --max-width`. Keep the camelCase forms as hidden
aliases for a release.

### 2.5 One way in to the dashboard

- `ngn ui [run-id]` starts ngnui (local install, else npx) with `--db` and `--live` filled in
  from the config, and opens the run when given an id. This replaces the "copy this command"
  line in the `ngn run` readout.
- `ngnui` without `--live` reads the config's `port` and probes `/api/meta`. The editor turns on
  when a runtime answers, so the flag becomes optional.

### 2.6 A readout that says what is running

`printReadout` (`packages/ngn/src/cliCmd/run.ts`) names the database and endpoint but not the
tasks. List each scheduled task with its schedule in words, as the UI shows it. Rename the
"live" line to "runtime". When a run fails, print a pointer to it: `failed  extract.ts #41 → ngn show 41`.

---

## Phase 3: CLI inspect commands (one object model across both surfaces)

Add read commands whose nouns, columns and status words match the UI's. Every one takes `--json`.

| Command | Mirrors UI | Notes |
| --- | --- | --- |
| `ngn status` | Overview | verdict line, then one row per task: schedule, health, last ran, avg |
| `ngn runs` | Runs page | `--task`, `--status`, `--origin`, `--since`, `--limit`; also accepts the UI token string, e.g. `ngn runs "status:failed task:extract since:24h"` |
| `ngn show <run>` | run page | verdict and callout text first, then logs, timings, result |
| `ngn logs <task\|run>` | Logs tabs | `--level`, later `--follow` |

All of them use the same derivations as the UI, including the Stalled rule and skip-reason
sentences. Moving those into a shared module (probably `@apisurf/ngn-core` or a small shared
package that `packages/ui/src/server/queries.ts` also uses) is what keeps the vocabulary from
drifting. `ngn sql` stays as the way to get anything these commands don't cover.

---

## Phase 4: UI navigation and faceted Runs

### 4.1 One navigation column

Today navigation has three layers: a rail with three pages, a Tasks sidebar, and a VS Code-style
tab strip with preview (italic) and pinned tabs. For an app with three pages and N tasks, that
is more wayfinding machinery than there is content. Proposal:

- **Merge the rail into the sidebar.** Overview, Runs and Editor go at the top as global
  navigation, with the Tasks list below as local context.
- **Make the tab strip opt-in, or drop it.** Every view already has a stable URL (the
  multiple-front-doors principle), so browser tabs and back/forward cover the same need without
  the preview/pin semantics.
- **Breadcrumb header:** `Tasks / extract.ts / Run #2`, with `[` `]` stepping between runs as now.

Validate with a tree test (below) before building. This reverses part of the "simplify ui"
commit's direction, so it should be a deliberate decision.

### 4.2 Command palette (⌘K)

Jump to a task by name, a run by `#id`, or a page, and toggle Follow or theme. This also fixes
`/`, which currently focuses a different input depending on the page (`useSlashToFilter` in
`shell.tsx`), so the same key does different things.

### 4.3 Faceted Runs page (replaces History)

- A token filter bar: `status:failed task:extract origin:editor since:24h version:3`. The facets
  come from the glossary, and the bar stays URL-synced as History is today.
- Each facet value shows its count ("Failed 3 · Skipped 2 · Stalled 1"), so the shape of the data
  is visible before anyone filters (PDF §3, telemetry sidebar).
- The 24h activity chart sits at the top of Runs. Dragging across it sets `since:`/`until:`,
  which is time-scrubbing on the LATCH time axis.
- **The task's Runs tab is the same component with `task:` locked.** One view and one way to
  filter, at two scopes.
- Built-in views as chips: Failing, Stalled, Skipped, Editor runs. Skip custom saved views for
  now: there's little to save in a local single-user tool.

### 4.4 Sidebar rows that carry scent

Replace the raw run count on each task row (low information) with health: a failing, stalled or
circuit-open glyph, and the time it last ran on hover. Healthy stays quiet.

---

## Phase 5: later

- **Queues.** They're first-class in the README but invisible in ngnui because `_ngn_jobs` lives
  in each task's own DB. A read-only Queue panel on the task page (status counts, oldest wait)
  would complete the object model. It needs ngnui to open task DBs read-only.
- **Locks page**, if locks see real use beyond the two miners.

---

## Validation (sized for a small team)

- **Content inventory:** export every label, flag, help heading and README heading into the
  glossary sheet and mark conflicts. Most of it is done in the tables above.
- **Task walkthrough:** for the six top tasks, count clicks and commands before and after each
  phase.
- **Tree test:** give 5–8 tasks ("where do you see why extract.ts skipped?", "find run 41") to a
  couple of users against a text-only menu tree of the proposed navigation.
- **Agent findability test for the CLI:** give an agent only `ngn --help` and the six top tasks,
  and see which commands it reaches for. The help is already written for that reader, so it's a
  cheap, repeatable tree test.
- **Skip card sorting.** The feature set is small enough that the inventory and glossary cover it.

## What not to take from the reference

Miller columns (the hierarchy is only Task › Run deep), a human vs agent mode split (agents use
the CLI and humans use the UI, which is already the split), and per-user saved views.

## Keep

Read-only by construction, URL-synced filters, the verdict-first run page, skip reasons in plain
sentences, stdout/stderr discipline in `ngn sql`, "next:" hints after `init`/`add`, and help
that ends in examples.

## Compatibility

Old CLI command names and flags stay as hidden aliases for at least one minor release, listed
under "Upgrading" in `packages/ngn/README.md`. The only behaviour change is the `ngn init`
default database (1.8), and it needs a changeset that says so.
