# 12: One `run` command

**What to build:** running tasks goes through one verb with clear modifiers. Today there's `run`, `run:once` and `run:single`. "once" and "single" read as synonyms but behave differently: `run:single` ignores the config, loads no env and records nothing. And `run` filters with `--match` while `run:once` takes a positional pattern.

**Blocked by:** [03: Forgiving task matching](03-forgiving-task-matching.md), [08: CLI flags in one style](08-cli-flags-in-one-style.md)

**Status:** done

- [x] `ngn run [task…]` schedules the matching tasks and blocks. With no arguments it schedules everything, as today
- [x] `ngn run <task> --once` runs one task now, records it and exits non-zero if it throws (today's `run:once`)
- [x] `ngn run <file> --timing <cron>` schedules one file on a given pattern using the project config, env and database. `--no-config` gives today's `run:single` behaviour
- [x] `run:once`, `run:single` and `--match` keep working as hidden aliases
- [x] `--help` for `run` states which forms block and which exit
- [x] The ngn README cheat sheet and "Upgrading" section reflect the new forms
