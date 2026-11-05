# 14: `ngn run` readout lists its tasks

**What to build:** when `ngn run` starts, it says what it scheduled. Today the readout names the version, the database and the endpoint, but not the tasks, so the only way to confirm a task was picked up is to wait for it to tick.

**Blocked by:** [06: Shared run and task derivations](06-shared-run-and-task-derivations.md)

**Status:** done

- [x] The readout lists each scheduled task with its path and its schedule in words, using the same wording as the UI
- [x] A task whose timing can't be read, or that has no `timing` export, is listed with the reason instead of disappearing from the list
- [x] The line for the runtime endpoint is labelled "runtime", not "live"
- [x] With zero matching tasks, the readout says so and points at `match` in the config
