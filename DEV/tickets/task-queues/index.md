# Task queues and scheduling primitives

Primitives so tasks stop hand-writing the queue logic both miners carry today: runs that know their time slot, locks between tasks, a SQLite-backed job queue, and retries that respect the schedule. Everything lives in SQLite; nothing runs outside `ngn run`.

Tickets in dependency order (blockers first).

| # | Ticket | Blocked by | Delivers |
| --- | --- | --- | --- |
| 01 | [Versioned migrations for ngn's own database](01-versioned-migrations.md) | — | Existing `ngn.sqlite` files pick up new schema |
| 02 | [One context per run](02-one-context-per-run.md) | — | Overlapping runs keep their own run id, logs and status |
| 03 | [Store the task's return value with its run](03-store-task-result.md) | [01](01-versioned-migrations.md) | `task_runs.result`, in `ngn sql` and ngnui |
| 04 | [Overlap policy](04-overlap-policy.md) | [02](02-one-context-per-run.md) | `overlap = "skip" \| "allow"` on croner, `skip` by default |
| 05 | [`ctx.run`: the run's time slot](05-run-time-slot.md) | [04](04-overlap-policy.md) | `nextAt`, `deadline` and an abort signal for every run |
| 06 | [Named locks](06-named-locks.md) | [01](01-versioned-migrations.md), [02](02-one-context-per-run.md) | `ctx.lock` and `exclusive`, across processes |
| 07 | [Queue: storage and job lifecycle](07-queue-lifecycle.md) | [02](02-one-context-per-run.md) | `ctx.queue` with add, claim, fail/backoff, release, park |
| 08 | [`queue.work()` runner](08-queue-work-runner.md) | [05](05-run-time-slot.md), [07](07-queue-lifecycle.md) | Fair worker pool that stops when the slot ends |
| 09 | [Retry for the whole run, plus a circuit breaker](09-run-retry.md) | [05](05-run-time-slot.md) | `retry` export that never runs into the next tick |
| 10 | [Port the miners to the queue and a lock](10-port-properties-extract.md) | [03](03-store-task-result.md), [06](06-named-locks.md), [08](08-queue-work-runner.md) | Both miners' queue code replaced by the primitives |
