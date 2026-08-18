# ngn CLI tool monorepo

![ngn logo](./logo/ngn-logo.png)

Two published CLIs over one SQLite file:

- **[`@apisurf/ngn`](./packages/ngn)** (`packages/ngn`) — schedules and runs
  tasks, writing every run, log and timing into the database. `ngn sql` reads
  it back from the terminal.
- **[`@apisurf/ngnui`](./packages/ngnui)** (`packages/ngnui`) — a standalone
  viewer: point it at a database and it serves a prebuilt dashboard for it.

The scheduler does not serve a web UI, and the viewer does not run tasks. The
one thing that crosses that line is the live task editor, which needs a
runtime: ngnui forwards it to an `ngn run` process when told where to find one.

See `packages/ngn/README.md` and `packages/ngnui/README.md` for usage.
