# 08: `queue.work()` runner

**What to build:** one call drains a queue inside the run's time slot. `queue.work(handler, options)` claims jobs and runs `handler` on a pool of workers until the queue is empty, a cap is reached or the slot ends. Whatever is left waits for the next tick. The handler's outcome decides the job's fate: returning completes it, throwing fails it, and the worker handle can release a job or stop a whole group for the rest of the run (the bot-wall case).

Fairness is the miners' rule: groups are shuffled and served one job per round, a group never has two jobs running at once, and `perGroup` caps how much one group can take per run.

**Blocked by:** [05: `ctx.run`: the run's time slot](05-run-time-slot.md), [07: Queue: storage and job lifecycle](07-queue-lifecycle.md)

**Status:** done

- [x] Options: `concurrency`, `max`, `perGroup`, `until` (a signal or a timestamp, default `ctx.run.signal`), `worker: { setup, teardown }`
- [x] No new claims after `until`; jobs in flight finish
- [x] Never two jobs of one group at the same time; groups are spread across a run, not drained one at a time
- [x] `stopGroup({ refund })` releases that group's claimed jobs and skips the rest of it this run
- [x] A crash in the runner itself releases the jobs it claimed but never started
- [x] Returns `{ done, failed, released, dead, remaining, oldestAgeMs }`, which can be returned from `task` as is
