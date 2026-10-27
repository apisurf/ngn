# 06: Named locks

**What to build:** tasks can keep out of each other's way by name instead of by cron offsets. `ctx.lock(name, fn, { ttl, wait })` runs `fn` while holding the lock, and `export const exclusive = ["browser:njuskalo"]` holds the named locks for the whole run. When a lock is held elsewhere, the run either waits (up to its deadline) or is recorded as skipped. Locks are leases in `ngn.sqlite`, so they also hold against a `run:once` in another process, and an expired lease from a crashed process can be taken.

**Blocked by:** [01: Versioned migrations for ngn's own database](01-versioned-migrations.md), [02: One context per run](02-one-context-per-run.md)

**Status:** done

- [x] A migration adds the lock table; taking a lock is one atomic statement
- [x] A held lock blocks another run in the same process and in a second process on the same file
- [x] A lease past its expiry can be taken over; a holder renews its lease while it runs
- [x] Locks are released when `fn` or the run ends, including when it throws
- [x] `exclusive` with a busy lock records the run as skipped, with a log line naming the lock
- [x] With an in-memory database, locks still work within the process
