---
"@apisurf/ngn": minor
"@apisurf/ngn-core": minor
"@apisurf/ngn-os": minor
"@apisurf/ngn-persistence": minor
"@apisurf/ngn-schema": minor
---

Publish the four libraries ngn is built from, and drop the dashboard from this
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
