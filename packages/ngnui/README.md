# ngnui

Browse an [ngn](https://www.npmjs.com/package/@apisurf/ngn) task database in
your browser: tasks, runs, logs, timings and a dashboard.

```bash
npx @apisurf/ngnui --db ./ngn.sqlite
```

It serves a prebuilt UI over one file, binds to `127.0.0.1` only, and opens the
database without migrating it — so it is unreachable from the network and
cannot change what it is showing. Leaving it open while `ngn run` is going is
fine; refresh for new runs.

## Options

```
--db <path>     Database file to read. Default ./ngn.sqlite
--port <n>      Port to serve on. Default 3000, or the next free port above it
--live <url>    Base URL of a running `ngn run` to forward the live editor to
-h, --help      Show help
-v, --version   Show the version
```

The database is written by `ngn run`, so set `dbPath` in `ngn.config.ts` to a
`file:` URL — the default (`:memory:`) leaves nothing to browse. A missing file
is not an error: the UI starts empty and fills in.

## Live tasks

The live editor executes code, which needs a project's compiler, config, env
and plugins — things a viewer pointed at a file does not have. `ngn run` keeps
a small endpoint for it, and ngnui forwards there when you say where it is:

```bash
ngn run                                          # in the project
ngnui --db ./ngn.sqlite --live http://127.0.0.1:4545
```

Without `--live` the editor reports that it has no runtime and disables Run.
The URL's port is the `port` value from `ngn.config.ts` (4545 by default).

## Prefer the terminal?

`ngn sql "<query>"` reads the same file, prints rows and exits — no server, and
better suited to scripts and agents.

## Development

```bash
pnpm dev:server   # the API against $NGN_UI_DB, on :8787
pnpm dev          # Vite on :3000, proxying /api to the above
pnpm build        # dist/client (Vite) + dist/server.js (tsup)
```
