# NGN Distribution

Publishing `@apisurf/ngn` CLI to GitHub Packages using changesets.

## Publishing Workflow

```bash
# 1. Create changesets during development
pnpm version:changeset

# 2. Bump versions when ready to release
pnpm version:bump

# 3. Build, inject deps, and publish
pnpm version:release
```

## Local Testing (Before Publishing)

```bash
# Build and pack
pnpm build
cd packages/cli
npm pack

# Install and test locally
npm install -g ./apisurf-ngn-*.tgz
ngn --version
ngn --help
```

## Verify Package Contents

```bash
cd packages/cli
npm pack --dry-run
```

**Should include:** `dist/cli.js`, `dist/ui/`, `package.json`

**Should NOT include:** `src/`, `node_modules/`, `*.ts` files
