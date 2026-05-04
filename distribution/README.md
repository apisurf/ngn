# NGN Distribution

Publishing `@apisurf/ngn` (and sibling `@apisurf/*` packages) to the public **npm registry** using changesets.

## Prerequisites

1. An npm account with publish rights to the `@apisurf` scope.
2. Sign in once on your machine:
   ```bash
   npm login
   ```
   Verify with `npm whoami`.
3. The `@apisurf` scope must exist on npm and be configured for **public** scoped publishing. The first publish of a brand-new scoped package needs `--access public`; this repo's `publishConfig.access = "public"` and `.changeset` config already set that.

For CI, export `NPM_TOKEN` and let an `.npmrc` like the following authenticate non-interactively:
```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

## Publishing Workflow

```bash
# 1. Create changesets during development & bump versions
pnpm version:bump

# 2. Build, inject deps, and publish
pnpm version:release
```

`version:release` runs `distribution/release.sh`, which:

1. Verifies `npm whoami` (or `NPM_TOKEN` in CI).
2. Builds every workspace package.
3. Flattens workspace deps into `@apisurf/ngn` via `inject-deps`.
4. Calls `changeset publish`, which pushes each public package to https://registry.npmjs.org/.

## Local Testing (Before Publishing)

```bash
# Build and pack
pnpm build
cd packages/ngn
pnpm inject-deps
npm pack

# Install and test locally
npm install -g ./apisurf-ngn-*.tgz
ngn --version
ngn --help
```

## Verify Package Contents

```bash
cd packages/ngn
npm pack --dry-run
```

**Should include:** `dist/cli.js`, `dist/ui/`, `LICENSE`, `README.md`, `package.json`

**Should NOT include:** `src/`, `node_modules/`, `*.ts` source files
