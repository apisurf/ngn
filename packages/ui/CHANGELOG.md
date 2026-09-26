# @apisurf/ngnui

## 0.2.6

### Patch Changes

- 67e2209: Publish the `ngnui` dashboard as `@apisurf/ngnui`.

  `ngnui` serves a prebuilt web UI over an ngn database file: tasks, runs, logs,
  timings, stored keys, versions, a SQL console and the live task editor. It is
  now on npm and versioned in lockstep with `@apisurf/ngn`:

  ```bash
  npx @apisurf/ngnui --db ./ngn.sqlite
  ```

  `ngn run` and `ngn --help` no longer call it a separate paid module; they say
  where to install it from.

- ui lib

## 0.0.1

### Patch Changes

- Improvements
