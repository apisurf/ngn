# ngn glossary and object model

The reference every label, flag, help line and README heading in `ngn` and `ngnui` follows. When a
word here and a word in the product disagree, the product is wrong. The reasoning is in
[plan.md](plan.md); the work is in [`DEV/tickets/ia-redesign`](../tickets/ia-redesign/index.md).

## Objects

| Object | Belongs to | Key properties | Today in the UI | Today in the CLI |
| --- | --- | --- | --- | --- |
| **Project** | — | root folder, `ngn.config.ts`, database, runtime port | top-bar name, status-bar path | `ngn init`, `--root` |
| **Task** | Project | path, schedule (`timing`), behaviour (`retry`, `budget`, `overlap`, `exclusive`), hooks, health (derived) | Tasks sidebar, task page, Overview table | `ngn add`, `ngn run`; read only through `ngn sql` (`file_tasks`) |
| **Version** | Task | number, hash, compiled code | task › Versions | `ngn sql` (`file_task_versions`) |
| **Run** | Task | status, origin, attempt (`retry_of`), skip reason, result, start and end | run page, Runs page, task › Runs | `ngn sql` (`task_runs`) |
| **Log line** | Run, rolled up to its Task | level, message, time | run › Logs and Timeline, task › Logs | `ngn sql` (`logs`) |
| **Timing span** | Run, rolled up to its Task | label, duration, time | run › Timings and Timeline, task › Timings | `ngn sql` (`timings`) |
| **Stored value** | Task | key, value, when it was first and last set | task › Stored values | `ngn sql` (`kvs`) |
| **Lock** | Project, held by a Run | name, holder, lease expiry | Overview (Needs attention, Tasks table), run › Details | `ngn sql` (`locks`) |
| **Queue / Job** | the task's own database | queue name, job status counts, oldest wait | not shown | `ngn sql --db tasks/x.db` (`_ngn_jobs`) |

### Rules

- **An editor run is a Run with origin `editor`, not a Task.** ngn stores Editor code as a throwaway
  task file (`live-task-<ms>-<random>.ts`) so it can record the run, but people never see that file as
  a task: it stays out of the Tasks sidebar and the Overview, and its runs are found on the Editor
  page and under `origin:editor`.
- **Health is derived, never stored.** A task is *failing* when its latest run that reached a verdict
  failed, *stalled* when it has a stalled run, and *circuit open* when its latest run is a breaker
  skip. Otherwise it is healthy, and healthy is shown by showing nothing.
- **The CLI and the UI derive the same thing the same way.** Status words, skip sentences, the
  schedule in words, health and Stalled come from one shared module (`@apisurf/ngn-schema/describe`).

## Terms

One term per concept. The right-hand column lists what the term replaces; those words should not
appear in labels, flags or help text for this concept any more.

| Concept | Term | Replaces |
| --- | --- | --- |
| ngnui re-reading the database every two seconds | **Follow** | "Live" button, "● Live" in the status bar |
| The connection from ngnui to a running `ngn run` | **Live runtime** (short: *runtime*). The flag stays `--live` | "editor →" in the status bar, the "live" line in the `ngn run` readout |
| The page where you write code and run it once | **Editor** | "Live editor" (tab title, sidebar group, task header) |
| Runs made from the Editor | **editor runs** | "Live editor task", "Run at 18:56:04" in the task list |
| Values a task keeps with `ctx.kv` | **Stored values** | "Store", "Keys" (task tab; the tree test read "Keys" as API keys or secrets), "stored keys" |
| Every run of every task, newest first | **Runs** (page) | "History" |
| One task's runs | **Runs** (task tab) — the same view, scoped to one task | the "History" heading inside the tab |
| The run database | **database**, flag **`--db`** | `--dbFile` (`ngn init`). The config key stays `dbPath` |
| The port `ngn run` listens on for the Editor | **runtime port**, flag **`--port`** | `--apiPort`, "live server port", "API port" |
| The config file | flag **`--config`** | `--configFile` |
| The env file | flag **`--env-file`** | `--envFile` |
| A run that has no end and is past any window in which it could still finish | **Stalled** | "Running" with an ever-growing duration |
| A warning log line | **warn** level. `ctx.log.warning()` writes it, and both `warn` and `warning` read as this level | — |

## Run status

The words both surfaces show. The stored value is on the left; nothing else is ever displayed for it.

| Stored `task_runs.status` | Shown as | Notes |
| --- | --- | --- |
| `success` | **Succeeded** | |
| `failure` | **Failed** | |
| `skipped` | **Skipped** | always with its reason in words: *shouldSkip*, *still running*, *circuit open*, *lock `name`* |
| `running`, `pending` | **Running** | |
| `running`, `pending`, past its window | **Stalled** | derived, see below |
| no runs | **Never ran** | |

### When a run is Stalled

A run with no end is Stalled once it has been going for longer than the most it could legitimately
take, plus a margin:

```
window  = max(budget, the schedule's period), from the task's newest version
          24 hours when neither can be read from it
stalled = no end recorded  and  now - started_at > window × 2
```

The period is read for the schedules ngn can put into words (`every 5 minutes`, `hourly at :30`,
`daily at 09:00`); anything more particular counts as unknown. The fallback is long on purpose: a
run wrongly called Stalled is worse than one noticed a day late.

A lock whose lease ran out marks its run Stalled straight away, whatever the window: the lease is
renewed while the run's process lives, so an expired one means the process is gone.

## Filter keys

The keys the Runs page filter and `ngn runs` share. Values use the words above, in lowercase.

| Key | Values | Example |
| --- | --- | --- |
| `task` | a task path, or any part of one | `task:extract` |
| `status` | `succeeded`, `failed`, `skipped`, `running`, `stalled` | `status:failed` |
| `origin` | `scheduled`, `editor` | `origin:editor` |
| `since`, `until` | a duration back from now (`24h`, `7d`) or a date | `since:24h` |
| `version` | a version number | `version:3` |

`-key:value` excludes. Free text matches task paths. (Recording `--once` runs as their own origin
needs a core change and is out of scope for now.)

## Top tasks

The jobs the defaults should serve. The counts are how they go today, before the IA work; each
phase is measured against them.

| # | Task | Today in the UI | Today in the CLI |
| --- | --- | --- | --- |
| 1 | Is anything broken right now? | 0 clicks (Overview), but a stalled run reads as healthy | 1 hand-written `ngn sql` query; needs the schema |
| 2 | Why did task X fail, or why isn't it running? | 2 clicks: Needs attention row, then Logs | 2 queries: find the run, then its logs |
| 3 | Is X stuck, and what is it blocking? | 3 clicks to the run, which says "Running"; the skipped runs don't link to it | 1–2 queries, and you have to know what "stuck" looks like in the data |
| 4 | What did X return, store or log? | 2 clicks (task, then Keys or Logs); 3 for a result (task, run, Result) | 1 query per question |
| 5 | Try some code against the real config and env | Restart ngnui with `--live` copied from the `ngn run` readout, then 1 click | — |
| 6 | Set up a project so that 1–4 work at all | — | `ngn init`, then edit `dbPath` by hand (the default keeps nothing), `ngn add`, `ngn run`, copy the ngnui command |

## Resolved and deferred

Every inconsistency in the plan's vocabulary table:

| Inconsistency | Resolution |
| --- | --- |
| "Live" for auto-refresh, the runtime, and the editor | Resolved: Follow / Live runtime / Editor |
| Editor vs "Live editor" | Resolved: Editor |
| Store vs `ctx.kv` vs `kvs` | Resolved: Stored values in the UI (Keys until the tree test); `ctx.kv` in docs; `kvs` stays the table name |
| History page vs History heading in a task's Runs tab | Resolved: Runs, both |
| `dbPath` / `--dbFile` / `--db` | Resolved: `--db` for every flag; `dbPath` stays the config key |
| `port` / `--apiPort` / readout "live" | Resolved: `--port`, "runtime" in the readout |
| `--configFile`, `--envFile` vs `--max-width` | Resolved: kebab-case, `--config`, `--env-file` |
| Status words, History filter id `open` | Resolved: the status table above; `running` replaces `open` in URLs (old URLs still work) |
| `ctx.log.warning()` vs stored `warn` | Resolved: one level, warn; both spellings accepted |
| `run:once` vs `run:single` | Deferred to ticket 12 (one `run` command) |
| Origin `scheduled` vs `--once` | Deferred: needs a core migration, listed under "Not in this set" |
