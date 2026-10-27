# 02: One context per run

**What to build:** two runs of the same task that overlap each keep their own identity. Right now the run id lives in state shared by every run of a task, so when a run is still going as the next one starts, the first run's logs, timings and final status get written to the second run's row and the first row stays `running` forever. After this ticket every `execute()` gets its own run id, and `ctx.log`, `ctx.timing` and the success/failure bookkeeping all go to that run.

This is also where core gets its first tests.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Two overlapping executions of one task produce two `task_runs` rows, each ending in its own status
- [x] Logs and timings written during each run carry that run's id
- [x] A task that fails to load before a run row exists doesn't try to update a run that isn't there
- [x] `kv` stays scoped per task, not per run
- [x] core has a `test` script that runs under `pnpm test`, with a test for the overlap case
