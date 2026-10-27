# 03: Store the task's return value with its run

**What to build:** whatever `task` returns ends up in the database next to the run, as the README claims it does. It's stored as JSON in a new `result` column on `task_runs`, so `ngn sql` can query it and ngnui can show it on a run. A value that won't serialise is stored as its string form rather than failing the run. This is where queue summaries will show up later.

**Blocked by:** [01: Versioned migrations for ngn's own database](01-versioned-migrations.md)

**Status:** done

- [x] A migration adds a nullable `result` column to `task_runs`
- [x] A successful run stores its return value as JSON; `undefined` stores NULL
- [x] A circular or BigInt value doesn't fail the run
- [x] The run schema in `@apisurf/ngn-schema` and `ngn sql --help` list the column
- [x] ngnui shows the result on a run
