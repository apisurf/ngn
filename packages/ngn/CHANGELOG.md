# @apisurf/ngn

## 0.2.2

### Patch Changes

- 26ad08b: Publish the four libraries ngn is built from, and drop the dashboard from this
  repository.

  `ngn-core`, `ngn-os`, `ngn-persistence` and `ngn-schema` were private to the
  workspace. They are now `@apisurf/ngn-core`, `@apisurf/ngn-os`,
  `@apisurf/ngn-persistence` and `@apisurf/ngn-schema`, published on npm and
  versioned in lockstep with `@apisurf/ngn`. Anything that wants to read an ngn
  database — `@apisurf/ngn-schema` is the table shape — can now depend on the
  same definitions the scheduler uses instead of restating them.

  `@apisurf/ngn` depends on them normally rather than inlining them at build
  time, so `scripts/inject-dependencies.js` — which existed only to flatten the
  dependencies of packages that could not be installed from npm — is gone, and
  so are the five flattened entries it added to this package's manifest.

  **`@apisurf/ngn` is now ESM.** The libraries it depends on are ESM-only, so the
  CLI can no longer be built as CommonJS. Its `exports` map never offered a
  `require` entry, so `import { defineConfig } from "@apisurf/ngn"` is unchanged;
  a project reaching it through `require()` was relying on the bundle and needs
  to import it instead.

  The `ngnui` dashboard has moved to its own repository and is a paid module.
  `ngn run` and `ngn --help` say so where they mention it. Nothing about the
  database changed: `ngn sql` reads the same file and ships with `ngn`.

- Updated dependencies [26ad08b]
  - @apisurf/ngn-core@0.2.2
  - @apisurf/ngn-os@0.2.2
  - @apisurf/ngn-persistence@0.2.2

## 0.2.1

### Patch Changes

- 52e805f: Stop `SQLITE_BUSY: database is locked` when something else has the file open.

  Every SQLite connection now comes from one place (`openDbClient` in
  `ngn-persistence`) and carries a 5s busy timeout, instead of SQLite's default
  of 0 where the first contended statement fails outright. Task databases are
  opened in WAL, so a read from the UI or `ngn sql` no longer blocks a task
  mid-write.

  Readers deliberately leave the journal mode of a file they did not create
  alone: `ngn sql` and the `ngnui` server take the busy timeout only. The
  throwaway connection that creates a database file is now closed instead of
  leaking a second handle on every database `ngn` opens.

## 0.2.0

### Minor Changes

- ba16eff: Drop plugins. Tasks import what they need, and every task gets its own SQLite.

  The plugin system is gone: `plugins` in `ngn.config.ts`, `ctx.plugins`,
  `definePlugin`, `PluginRegistry` and the `@apisurf/ngn-plugin` package
  (`s3`, `resend`, `supabase`, `alerting`, `sqlite`) are all removed. A task that
  needs a library installs it and imports it directly — only your task code is
  bundled, imports are left external and resolved from your own `node_modules` at
  run time, so what you installed is what runs.

  This also removes a trap: plugins were only wired up under `ngn run`, so a task
  using `ctx.plugins` typechecked and then failed under `ngn run:once`,
  `ngn run:single` and the live editor.

  The one plugin worth keeping is now built in. `ctx.sqlite` is on every task,
  with no configuration: a database per task file, kept next to it
  (`tasks/scrape.ts` uses `tasks/scrape.db`) and created only when first used.
  It carries `execute(sql, args?)`, `batch(statements)`, `client`, `path`,
  `initDB({ file, migrations })` and `destroyDB(file)`, the same shape the plugin
  had.

  A task can only reach databases inside its own folder — absolute paths and
  paths that climb out with `..` are rejected — so one task's data cannot be read
  or deleted by a task in another folder. Connections are reused between runs and
  closed on shutdown.

- 7d48668: Split reading a task database from running one.

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

## 0.1.17

### Patch Changes

- Init package release

## 0.1.16

### Patch Changes

- Plugins v1 wrap up

## 0.1.15

### Patch Changes

- Add s3 plugin

## 0.1.14

### Patch Changes

- Split head UI

## 0.1.13

### Patch Changes

- sqlite plugin now offers multiple DB management from a single task

## 0.1.12

### Patch Changes

- Pass additional metadata to tasks

## 0.1.11

### Patch Changes

- package folders rename

## 0.1.10

### Patch Changes

- Plugin system

## 0.1.9

### Patch Changes

- updates

## 0.1.8

### Patch Changes

- Ouput correct package version

## 0.1.7

### Patch Changes

- Relase updates

## 0.1.6

### Patch Changes

- Update

## 0.1.5

### Patch Changes

- Small release updates

## 0.1.4

### Patch Changes

- Name revert; prep for github release

## 0.1.3

### Patch Changes

- Task dependencies structure change

## 0.1.2

### Patch Changes

- Fix globally exposed Node APIs

## 0.1.1

### Patch Changes

- Initial changeset
