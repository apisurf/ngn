# 09: Retry for the whole run, plus a circuit breaker

**What to build:** a task that isn't queue-shaped can still retry, without breaking its schedule. `export const retry = { attempts, delay }` retries a failed run inside the same slot, but only if the retry would start before the next tick; otherwise it gives up and leaves it to the next tick. `shouldRetry`, which tasks can already export but nothing calls, gets the final say on each retry. After N failed runs in a row, the breaker skips ticks with growing backoff, and one success resets it.

**Blocked by:** [05: `ctx.run`: the run's time slot](05-run-time-slot.md)

**Status:** done

- [x] Each attempt is its own `task_runs` row, linked to the first one
- [x] A retry that wouldn't start before `nextAt` doesn't happen
- [x] `shouldRetry(error, ctx)` returning false stops retrying
- [x] `retry.breaker = { after, maxSkip }` skips 1, 2, 4… ticks up to `maxSkip` after `after` failures in a row, recording them as skipped with a reason
- [x] Breaker state survives a restart of `ngn run`
- [x] Without a `retry` export, behaviour is unchanged
