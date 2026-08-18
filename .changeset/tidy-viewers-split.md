---
"@apisurf/ngn": minor
"@apisurf/ngnui": minor
---

Split reading a task database from running one.

`ngn` no longer serves HTTP. The `http` command is gone and `ngn run` starts
only a small loopback endpoint for live task execution, on the `port` from
`ngn.config.ts`. It prints the database path and the command to browse it.

New `ngn sql "<query>"` runs any SQLite query against the configured database
and prints a table, `--json` or `--csv`. It opens the file without migrating
it, and `ngn sql --help` documents the tables.

The UI package is now `@apisurf/ngnui` (was `@apisurf/ngn-ui`) and is a
standalone CLI: `ngnui --db ./ngn.sqlite` serves the prebuilt dashboard and the
API it needs from one process on one port, reading the file directly. Pass
`--live <url>` to point its live editor at a running `ngn run`; without it the
editor says so and disables itself. The internal `ngn-api` package was absorbed
into it.
