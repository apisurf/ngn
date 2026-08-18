# ngn-ui

## 0.2.0

### Minor Changes

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
- Updated dependencies
  - ngn-schema@0.1.17

## 0.1.16

### Patch Changes

- Plugins v1 wrap up
- Updated dependencies
  - ngn-schema@0.1.16

## 0.1.15

### Patch Changes

- Add s3 plugin
- Updated dependencies
  - ngn-schema@0.1.15

## 0.1.14

### Patch Changes

- Split head UI
- Updated dependencies
  - ngn-schema@0.1.14

## 0.1.13

### Patch Changes

- sqlite plugin now offers multiple DB management from a single task
- Updated dependencies
  - ngn-schema@0.1.13

## 0.1.12

### Patch Changes

- Pass additional metadata to tasks
- Updated dependencies
  - ngn-schema@0.1.12

## 0.1.11

### Patch Changes

- package folders rename
- Updated dependencies
  - ngn-schema@0.1.11

## 0.1.10

### Patch Changes

- Plugin system
- Updated dependencies
  - ngn-schema@0.1.10

## 0.1.9

### Patch Changes

- updates
- Updated dependencies
  - ngn-schema@0.1.9

## 0.1.8

### Patch Changes

- Ouput correct package version
- Updated dependencies
  - ngn-schema@0.1.8

## 0.1.7

### Patch Changes

- Relase updates
- Updated dependencies
  - ngn-schema@0.1.7

## 0.1.6

### Patch Changes

- Update
- Updated dependencies
  - ngn-schema@0.1.6

## 0.1.5

### Patch Changes

- Small release updates
- Updated dependencies
  - ngn-schema@0.1.5

## 0.1.4

### Patch Changes

- Name revert; prep for github release
- Updated dependencies
  - ngn-schema@0.1.4

## 0.1.3

### Patch Changes

- Task dependencies structure change
- Updated dependencies
  - ngn-schema@0.1.3

## 0.1.2

### Patch Changes

- Fix globally exposed Node APIs
- Updated dependencies
  - ngn-schema@0.1.2

## 0.1.1

### Patch Changes

- Initial changeset
- Updated dependencies
  - ngn-schema@0.1.1
