# ngn CLI tool monorepo

![ngn logo](./logo/ngn-logo.png)

A CLI scheduler for Node tasks, over one SQLite file:

- **[`@apisurf/ngn`](./packages/ngn)** (`packages/ngn`) — schedules and runs
  tasks, writing every run, log and timing into the database. `ngn sql` reads
  it back from the terminal.

It is built from four libraries, each published on its own so anything else
can read or write the same database:

| Package | Directory | What it is |
| --- | --- | --- |
| `@apisurf/ngn-core` | `packages/core` | Task compilation, scheduling, and the run/log/timing services |
| `@apisurf/ngn-os` | `packages/os` | Filesystem and process helpers: discovery, watching, config, signals |
| `@apisurf/ngn-persistence` | `packages/persistence` | SQLite client, connection pragmas and migrations |
| `@apisurf/ngn-schema` | `packages/schema` | zod definitions for the tables ngn reads and writes |

All five are versioned together — the changeset `fixed` group in
`.changeset/config.json` keeps them on one number.

## The dashboard

`@apisurf/ngnui` serves a prebuilt web dashboard over the same database file.
It is a **paid module** and lives in its own repository; `ngn sql` covers the
same data from the terminal and ships here.

The scheduler does not serve a web UI, and the viewer does not run tasks. The
one thing that crosses that line is the live task editor, which needs a
runtime: ngnui forwards it to the small loopback endpoint an `ngn run` process
keeps (`GET /api/meta` to probe, `POST /api/live` to execute), when told where
to find one.

## Development

```bash
pnpm install
pnpm build          # turbo, in dependency order
pnpm typecheck      # tsc --noEmit, per package
pnpm lint           # oxlint
pnpm fmt            # oxfmt (fmt:check to verify without writing)
```

See `packages/ngn/README.md` for usage.

### Before you push

Nothing runs these for you — there is no CI on push — so run them locally:

```bash
pnpm lint && pnpm typecheck && pnpm fmt:check && pnpm build
```

`lint` reports maintainability limits as warnings and does **not** fail the
command, so read its output rather than trusting the exit code.

### What the linter enforces

Beyond oxlint's `correctness`, `suspicious` and `perf` categories, four
structural limits are set in `.oxlintrc.json`:

| Rule | Limit | What it catches |
| --- | --- | --- |
| `complexity` | 15 (modified) | a function with too many branches to hold in your head |
| `max-depth` | 4 | nesting that wants an early return or a helper |
| `max-params` | 5 | an argument list that wants to be an object |
| `max-nested-callbacks` | 3 | callback pyramids |

The thresholds were picked from this codebase's own distribution: the median
function scores 3 and the 95th percentile is around 7, so a hit is a genuine
outlier rather than ordinary branching. Split the function — that is almost
always the right fix. If it truly is not, suppress the one line and say why:

```ts
/* oxlint-disable complexity -- exhaustive protocol switch, flat by nature */
```

## Releasing

All five packages go out together on one version.

```bash
pnpm version:bump                      # write a changeset, apply it to every package
git add -A && git commit -m "Version 0.2.3"
pnpm version:release                   # build, then publish via changesets
git push --follow-tags
```

The commit is a real step: changesets is configured with `commit: false`, so the
version bumps, the CHANGELOG entries and the removal of the consumed changeset
are all left in the working tree for you to review and commit.

`version:release` asks for an npm **granular access token**, held in memory only.
It needs **read and write on the whole `@apisurf` scope** — a token limited to
selected packages cannot create new ones — and **Bypass 2FA** checked, or the
registry rejects the publish with `EOTP`.

Publishing is per package and not atomic, while the git tags are written either
way. Confirm on npm rather than trusting the tags; re-running `version:release`
publishes only what is missing.

See [`distribution/README.md`](./distribution/README.md) for the details.
