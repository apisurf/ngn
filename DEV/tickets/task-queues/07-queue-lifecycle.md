# 07: Queue: storage and job lifecycle

**What to build:** a task can put work in a queue and another run (of the same task or a different one) can take it out, with retries and crash recovery handled by ngn rather than by hand-written SQL. `ctx.queue(name, { db })` returns a queue backed by a `_ngn_jobs` table in the database you pass in, by default the task's own `ctx.sqlite`. Keeping it next to your data means a job can be enqueued in the same transaction as the row it is about.

The miners use one timestamp for two jobs. The queue splits them: `run_after` holds the earliest next attempt (backoff), and `lease_until` marks when ngn treats a claim as abandoned (crash recovery).

Shape worked out in the design discussion:

```sql
_ngn_jobs(id, queue, key, grp, payload, priority,
          status,       -- ready | leased | done | dead | parked
          attempts, max_attempts, run_after, lease_until, last_error,
          created_at, updated_at,
          UNIQUE(queue, key))
```

Operations: `add` (skipped if the key is already queued), `claim` (atomic, returns the jobs it took), `complete`, `fail` (backoff, then `dead` once attempts run out), `release` (give back without spending an attempt, with an optional delay), `park` / `reopen` (set aside and bring back, e.g. by group), and `stats`.

**Blocked by:** [02: One context per run](02-one-context-per-run.md)

**Status:** done

- [x] The table is created through the existing `_ngn_migrations` mechanism of the target database
- [x] `add` with a key that already exists in that queue does nothing and says so
- [x] `claim` is one statement, so two concurrent claimers never get the same job
- [x] A claimed job whose lease has expired is claimable again, and it has already spent an attempt
- [x] `fail` sets `run_after` from the backoff; at `max_attempts` the job goes to `dead`
- [x] `release` refunds the attempt; `park`/`reopen` take a group filter
- [x] `stats` returns counts by status and the age of the oldest ready job
- [x] Payloads round-trip as JSON and are typed through a generic
