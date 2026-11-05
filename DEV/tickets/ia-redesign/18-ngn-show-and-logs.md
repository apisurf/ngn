# 18: `ngn show <run>` and `ngn logs`

**What to build:** "why did this run fail?" answered in one command. `ngn show 41` prints the run's verdict first (the same callout text as the run page), then its logs, timings and result. `ngn logs extract` or `ngn logs 41` prints log lines for a task or a run. And a failing tick in `ngn run` points at the command that explains it.

**Blocked by:** [09: Stalled runs](09-stalled-runs.md)

**Status:** done

- [x] `ngn show <run-id>` prints the task, status, attempt (try 2/3), timing, skip reason or failure callout, then log lines, timings and the result
- [x] Stalled, skipped and retried runs read the same as on the run page, using shared wording
- [x] `ngn logs <task|run-id>` prints lines oldest-first with offset and level. It takes `--level` and `--limit`, and accepts both warn and warning
- [x] Both take `--json`
- [x] When a scheduled run fails, `ngn run` prints one line naming the task and run and suggesting `ngn show <id>`
- [x] Both are listed under Inspect in `ngn --help`
