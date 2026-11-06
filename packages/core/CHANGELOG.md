# ngn-core

## 0.3.1

### Patch Changes

- Say what failed, and where.

  - A run that throws records it: an error line `Failed in <stage>: <error>`, with the stack frames inside the task, which `ngn show`, `ngn logs` and ngnui's run page lead with. The stage is `load` (the file threw while it was evaluated, or exports no `task`), `start` (the breaker or `exclusive` locks), `shouldSkip`, `task`, `record` (storing the result), or a hook. Before, ngn recorded that a run failed and not what it threw.
  - `ngn run` prints one line per problem, with its stage and what was thrown: `failed  tasks/x.ts #41 in task: TypeError: … → ngn show 41`. `ngn run --once` and editor runs add the frames. A task file that does not compile, and so has no run, is printed with the error rather than only its name.
  - A run whose `shouldSkip` throws, or whose breaker or lock check fails, is ended as failed. It used to stay `pending` for good.
  - A task file that throws while loading, or exports no `task` function, is a failed run in `load` with the module's own error. It used to fail with no run and "Entry failed to get exports".
  - An error thrown by `onSuccess`, `onError` or `onComplete` is recorded on the run and printed, and no longer changes the run's outcome: a succeeded run stays succeeded (it used to be reported as failed while its row said succeeded), and `onError` throwing no longer replaces the task's error.
  - An editor run no longer closes the databases of scheduled runs that are still going. It used to close every task database in the process when it finished, so a scheduled run in progress failed on its next query.
  - `ctx.env` is `{}` when there is no env file, instead of `null`, so `Object.keys(ctx.env)` (in the editor's own starter code) no longer throws.
  - An editor run that throws comes back to the editor as a failure, with its stage, instead of as a `null` result. Editor runs no longer add a pair of signal handlers to the `ngn run` process each time.
  - `@apisurf/ngn-core` exports `runFailure(error)` (the run and stage an error was recorded under), `releaseTaskDatabases(taskSourcePath)` and the `RunProblem` and `RunStage` types; `createControlsGenerator` takes a `report` callback. `@apisurf/ngn-schema/describe` adds `failureLine`, `readFailureLine`, `errorSummary` and `errorFrames`.

- Updated dependencies
  - @apisurf/ngn-schema@0.3.1
  - @apisurf/ngn-os@0.3.1
  - @apisurf/ngn-persistence@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies
  - @apisurf/ngn-schema@0.3.0
  - @apisurf/ngn-os@0.3.0
  - @apisurf/ngn-persistence@0.3.0

## 0.2.9

### Patch Changes

- Simplify ui
- Updated dependencies
  - @apisurf/ngn-os@0.2.9
  - @apisurf/ngn-persistence@0.2.9
  - @apisurf/ngn-schema@0.2.9

## 0.2.8

### Patch Changes

- Extend tasks runtime API
- Updated dependencies
  - @apisurf/ngn-os@0.2.8
  - @apisurf/ngn-persistence@0.2.8
  - @apisurf/ngn-schema@0.2.8

## 0.2.7

### Patch Changes

- UX improvements
- Updated dependencies
  - @apisurf/ngn-os@0.2.7
  - @apisurf/ngn-persistence@0.2.7
  - @apisurf/ngn-schema@0.2.7

## 0.2.6

### Patch Changes

- ui lib
- Updated dependencies
  - @apisurf/ngn-os@0.2.6
  - @apisurf/ngn-persistence@0.2.6
  - @apisurf/ngn-schema@0.2.6

## 0.2.5

### Patch Changes

- Improvements
- Updated dependencies
  - @apisurf/ngn-os@0.2.5
  - @apisurf/ngn-persistence@0.2.5
  - @apisurf/ngn-schema@0.2.5

## 0.2.4

### Patch Changes

- docs update
- Updated dependencies
  - @apisurf/ngn-persistence@0.2.4
  - @apisurf/ngn-schema@0.2.4
  - @apisurf/ngn-os@0.2.4

## 0.2.3

### Patch Changes

- Release procedure and docs update
- Updated dependencies
  - @apisurf/ngn-os@0.2.3
  - @apisurf/ngn-persistence@0.2.3
  - @apisurf/ngn-schema@0.2.3

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
  - @apisurf/ngn-persistence@0.2.2
  - @apisurf/ngn-schema@0.2.2

## 0.2.1

### Patch Changes

- ngn-os@0.2.1
- ngn-persistence@0.2.1
- ngn-schema@0.2.1

## 0.2.0

### Patch Changes

- ngn-os@0.2.0
- ngn-persistence@0.2.0
- ngn-schema@0.2.0

## 0.1.17

### Patch Changes

- Init package release
- Updated dependencies
  - ngn-os@0.1.17
  - ngn-persistence@0.1.17
  - ngn-schema@0.1.17

## 0.1.16

### Patch Changes

- Plugins v1 wrap up
- Updated dependencies
  - ngn-persistence@0.1.16
  - ngn-schema@0.1.16
  - ngn-os@0.1.16

## 0.1.15

### Patch Changes

- Add s3 plugin
- Updated dependencies
  - ngn-persistence@0.1.15
  - ngn-schema@0.1.15
  - ngn-os@0.1.15

## 0.1.14

### Patch Changes

- Split head UI
- Updated dependencies
  - ngn-persistence@0.1.14
  - ngn-schema@0.1.14
  - ngn-os@0.1.14

## 0.1.13

### Patch Changes

- sqlite plugin now offers multiple DB management from a single task
- Updated dependencies
  - ngn-persistence@0.1.13
  - ngn-schema@0.1.13
  - ngn-os@0.1.13

## 0.1.12

### Patch Changes

- Pass additional metadata to tasks
- Updated dependencies
  - ngn-persistence@0.1.12
  - ngn-schema@0.1.12
  - ngn-os@0.1.12

## 0.1.11

### Patch Changes

- package folders rename
- Updated dependencies
  - ngn-persistence@0.1.11
  - ngn-schema@0.1.11
  - ngn-os@0.1.11

## 0.1.10

### Patch Changes

- Plugin system
- Updated dependencies
  - ngn-persistence@0.1.10
  - ngn-schema@0.1.10
  - ngn-os@0.1.10

## 0.1.9

### Patch Changes

- updates
- Updated dependencies
  - ngn-persistence@0.1.9
  - ngn-schema@0.1.9
  - ngn-os@0.1.9

## 0.1.8

### Patch Changes

- Ouput correct package version
- Updated dependencies
  - ngn-persistence@0.1.8
  - ngn-schema@0.1.8
  - ngn-os@0.1.8

## 0.1.7

### Patch Changes

- Relase updates
- Updated dependencies
  - ngn-persistence@0.1.7
  - ngn-schema@0.1.7
  - ngn-os@0.1.7

## 0.1.6

### Patch Changes

- Update
- Updated dependencies
  - ngn-persistence@0.1.6
  - ngn-schema@0.1.6
  - ngn-os@0.1.6

## 0.1.5

### Patch Changes

- Small release updates
- Updated dependencies
  - ngn-persistence@0.1.5
  - ngn-schema@0.1.5
  - ngn-os@0.1.5

## 0.1.4

### Patch Changes

- Name revert; prep for github release
- Updated dependencies
  - ngn-persistence@0.1.4
  - ngn-schema@0.1.4
  - ngn-os@0.1.4

## 0.1.3

### Patch Changes

- Task dependencies structure change
- Updated dependencies
  - ngn-persistence@0.1.3
  - ngn-schema@0.1.3
  - ngn-os@0.1.3

## 0.1.2

### Patch Changes

- Fix globally exposed Node APIs
- Updated dependencies
  - ngn-persistence@0.1.2
  - ngn-schema@0.1.2
  - ngn-os@0.1.2

## 0.1.1

### Patch Changes

- Initial changeset
- Updated dependencies
  - ngn-persistence@0.1.1
  - ngn-schema@0.1.1
  - ngn-os@0.1.1
