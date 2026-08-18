# ngn-persistence

## 0.2.4

### Patch Changes

- docs update
- Updated dependencies
  - @apisurf/ngn-os@0.2.4

## 0.2.3

### Patch Changes

- Release procedure and docs update
- Updated dependencies
  - @apisurf/ngn-os@0.2.3

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
  - @apisurf/ngn-os@0.2.2

## 0.2.1

### Patch Changes

- ngn-os@0.2.1

## 0.2.0

### Patch Changes

- ngn-os@0.2.0

## 0.1.17

### Patch Changes

- Init package release
- Updated dependencies
  - ngn-os@0.1.17

## 0.1.16

### Patch Changes

- Plugins v1 wrap up
- Updated dependencies
  - ngn-os@0.1.16

## 0.1.15

### Patch Changes

- Add s3 plugin
- Updated dependencies
  - ngn-os@0.1.15

## 0.1.14

### Patch Changes

- Split head UI
- Updated dependencies
  - ngn-os@0.1.14

## 0.1.13

### Patch Changes

- sqlite plugin now offers multiple DB management from a single task
- Updated dependencies
  - ngn-os@0.1.13

## 0.1.12

### Patch Changes

- Pass additional metadata to tasks
- Updated dependencies
  - ngn-os@0.1.12

## 0.1.11

### Patch Changes

- package folders rename
- Updated dependencies
  - ngn-os@0.1.11

## 0.1.10

### Patch Changes

- Plugin system
- Updated dependencies
  - ngn-os@0.1.10

## 0.1.9

### Patch Changes

- updates
- Updated dependencies
  - ngn-os@0.1.9

## 0.1.8

### Patch Changes

- Ouput correct package version
- Updated dependencies
  - ngn-os@0.1.8

## 0.1.7

### Patch Changes

- Relase updates
- Updated dependencies
  - ngn-os@0.1.7

## 0.1.6

### Patch Changes

- Update
- Updated dependencies
  - ngn-os@0.1.6

## 0.1.5

### Patch Changes

- Small release updates
- Updated dependencies
  - ngn-os@0.1.5

## 0.1.4

### Patch Changes

- Name revert; prep for github release
- Updated dependencies
  - ngn-os@0.1.4

## 0.1.3

### Patch Changes

- Task dependencies structure change
- Updated dependencies
  - ngn-os@0.1.3

## 0.1.2

### Patch Changes

- Fix globally exposed Node APIs
- Updated dependencies
  - ngn-os@0.1.2

## 0.1.1

### Patch Changes

- Initial changeset
- Updated dependencies
  - ngn-os@0.1.1
