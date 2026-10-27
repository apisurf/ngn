# 10: Port the miners to the queue and a lock

**What to build:** proof that the primitives replace the hand-written machinery. properties-mine's extract run (and news-mine's process run, the same algorithm) uses `ctx.queue` and `queue.work()` in place of its own claim/lease/retire/park/release SQL and worker pool, keeping what it does today: per-site caps, never two tabs on one site, bot walls released without spending an attempt, and parking sites with no extractor. The cron offset that keeps `collect` and `extract` from hitting one site together becomes a lock.

properties-mine pins `@apisurf/ngn` from npm, so this needs a local link to the built packages or a release.

**Blocked by:** [03: Store the task's return value with its run](03-store-task-result.md), [06: Named locks](06-named-locks.md), [08: `queue.work()` runner](08-queue-work-runner.md)

**Status:** done

- [x] Waiting rows in the existing `extract_queue` (and news-mine's `scrape_queue`) are folded into the ngn queue the first time it is opened, and the old table dropped
- [x] The extract run no longer has its own claim, lease, retire, park or release SQL
- [x] `collect` runs on a plain schedule and shares a lock with `extract` per site
- [x] `make status` still reports queue depth and the oldest waiting row
- [x] A run against a real site completes and its summary shows in `task_runs.result`
