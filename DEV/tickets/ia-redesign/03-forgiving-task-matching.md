# 03: Forgiving task matching

**What to build:** you can name a task the way you think of it. Today the pattern has to include the folder (`tasks/scrape.ts`), and `scrape.ts` matches nothing without saying why. After this ticket, `ngn run:once scrape.ts` and `ngn run --match scrape.ts` find the task. A name that fits more than one task lists the candidates instead of guessing.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Resolution order: exact relative path, then the same path under the tasks folder, then a basename or path-suffix match. Globs keep working as they do now
- [x] An ambiguous single-task name (for `run:once`) exits non-zero and lists every candidate path
- [x] For scheduling, a name that matches several tasks schedules all of them, as a glob does today
- [x] Only tasks covered by the config's `match` are candidates, as before
- [x] The "no task matched" message suggests the closest task paths when any exist
- [x] Tests cover exact, under-tasks, basename, suffix, ambiguous and no-match cases
