# 04: Overlap policy

**What to build:** a task decides what happens when its next tick arrives while the previous run is still going. `export const overlap = "skip"` (the default) records the tick as a `skipped` run and does nothing else; `"allow"` starts a second run, as every task does today. The scheduler moves from node-cron to croner, which has no dependencies, supports the same seconds-first patterns, and gives us the next run time that ticket 05 needs.

Defaulting to `skip` changes behaviour for tasks that overlapped before; the README and changelog say so.

**Blocked by:** [02: One context per run](02-one-context-per-run.md)

**Status:** done

- [x] `ngn run` and `ngn run:single` schedule through croner; node-cron is gone from the dependencies
- [x] Every pattern that validated before still validates, including six-field ones
- [x] With the default, a tick during a running run adds a `skipped` row and doesn't call `shouldSkip` or `task`
- [x] With `overlap = "allow"`, overlapping runs both execute
- [x] An invalid `overlap` value fails at schedule time with a message naming the task
- [x] A run that throws doesn't take the scheduler down or leave the task marked as running
