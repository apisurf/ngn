# 16: `ngn status`

**What to build:** the Overview's answer to "is anything wrong?" from the terminal, without writing SQL. It's for a human glancing at a project and for an agent checking health before or after a change.

**Blocked by:** [09: Stalled runs](09-stalled-runs.md)

**Status:** done

- [x] The first line is the same verdict the Overview shows, including failing tasks, stalled runs and locks left behind
- [x] Then one row per scheduled task: path, schedule in words, health, when it last ran, average duration
- [x] Rows go to stdout and anything else to stderr, as with `ngn sql`
- [x] `--json` emits the verdict and rows as one object, with stable field names from the glossary
- [x] It finds the database the way `ngn sql` does (`--db`, else the config) and reports a `:memory:` or missing file the same way
- [x] The exit code is non-zero when the verdict isn't healthy, so scripts can use it
- [x] Listed under Inspect in `ngn --help`
