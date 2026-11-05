# Brief: making ngn and ngnui easier to understand

## Why

ngn schedules task files and records every run in SQLite. ngnui shows that database in a browser. Screen by screen, both are careful work. Using them together is harder than it should be, and the reasons sit underneath the screens.

**The two tools describe the same data differently.** In ngnui you look at tasks, runs, logs and keys. From the terminal, the only way to read anything is `ngn sql`, which means learning the storage tables first.

**Words don't stay put.** "Live" is the auto-refresh button, the `--live` flag and the "Live editor". `ctx.kv` values are "Store" in one place and `kvs` in another. The database flag is `--dbFile`, `--db` or `dbPath` depending on the command. `run:once` and `run:single` sound like synonyms but behave differently.

**Problems don't reach the summary.** In a real project database, a run has shown "Running" since 27 Oct, with a duration of "12381m 49s", and ngn has skipped later ticks because of it. The Overview says "All 2 tasks healthy".

## What we're doing

We're applying standard information-architecture practice:

1. **Name things once.** A glossary and object map that every label, flag and help line follows. This comes first, because everything else depends on it.
2. **Same objects on both surfaces.** `ngn status`, `ngn runs`, `ngn show` and `ngn logs` give the terminal the Overview, Runs and run pages, using the same words and the same rules. One shared module produces those words for both tools.
3. **Make state honest and visible.** A **Stalled** state for runs that will never finish, carried up to the task, the Overview verdict and the status bar, and a link from a skipped run to the run that blocked it.
4. **Show complexity only when there's something to show.** Pages open on whatever has content, empty tabs and zero stats stay out of the way, and `ngn --help` fits on one screen with reference topics behind it.
5. **Less navigation, more ways in.** One sidebar instead of a rail, a sidebar and a tab strip. A ⌘K palette. A Runs page filtered by `status:failed task:extract since:24h`, which is the same string `ngn runs` accepts. `ngn ui 41` opens straight on a run.
6. **Defaults that work.** `ngn init` keeps run history by default, and ngnui finds a running `ngn run` without being told where it is.

## In what order

| Stage | Tickets | Result |
| --- | --- | --- |
| Foundation and quick wins | 01–05 | Shared vocabulary, working defaults, forgiving names, quieter run pages |
| Shared rules and honest state | 06–11 | Stalled runs, one set of words in the UI, editor runs out of the task list, tidy bars |
| CLI shape | 12–15 | One `run` verb, help by intent, a readout that lists tasks, `ngn ui` |
| CLI read commands | 16–18 | `status`, `runs`, `show`, `logs` |
| Navigation and Runs | 19–24 | Tree test, then one navigation column, ⌘K, the faceted Runs page and time scrub |

Most of tickets 01–05 can run in parallel. Ticket 19 needs a person to run it, and ticket 20 waits on its result, because it partly reverses the recent "simplify ui" work.

## What done looks like

Measured against the six top tasks in the glossary:

- **Is anything broken?** One glance at the Overview, or one `ngn status`, and the answer covers stalled runs too.
- **Why did X fail or skip?** One click from the Overview, or `ngn show <id>`. No SQL.
- **Is X stuck, and what is it blocking?** Stalled is named, and the skipped runs link to it.
- **What did X return, store or log?** Same names in both tools, so the answer looks the same in either.
- **Try code against the real env.** `ngnui` with no flags enables the Editor when `ngn run` is up.
- **Set up a project.** `ngn init`, `ngn add`, `ngn run`, `ngn ui`, and everything above works with no config edits.

## Not changing

Read-only by construction, filters kept in the URL, run pages that lead with the verdict, skip reasons in plain sentences, clean stdout/stderr in the CLI, and every old command and flag kept as an alias for at least one release.
