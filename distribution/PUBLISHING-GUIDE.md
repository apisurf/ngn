# CLI publishing Guide

Publishing the op3 CLI package to npm.

## Publishing CLI Only

This section covers publishing only the `@op3/cli` package with bundled dependencies.

### Quick Publish Commands

```bash
# From repo root
npm login                        # First time only
pnpm build                       # Build all packages

cd packages/cli
pnpm inject-deps                 # scan workspace modules deps and inject to the published(CLI) package so that the consumers can install all the required node packages

./distribution/publish-cli.sh    # Publish CLI
```

## Local test and dry-run

### 1. Build & Test

1. Run `pnpm build` successfully from repo root
2. Test CLI locally:

```bash
cd packages/cli
npm pack
npm install -g ./op3-cli-1.0.0.tgz
op3 --version
op3 --help
```

3. Test all commands:

- `op3 init`
- `op3 run ./tasks`
- ...

### 2. Verify Package Contents

```bash
cd packages/cli
npm pack --dry-run
```

Should include:

- ✅ `dist/cli.js` (main binary)
- ✅ `dist/ui/` (bundled UI files)
- ✅ `src/cli.d.ts` (type definitions)
- ✅ `package.json`

Should NOT include:

- ❌ `src/` source files (except cli.d.ts)
- ❌ `node_modules/`
- ❌ `.ts` source files
- ❌ `tsconfig.json`

## Updating & Republishing

### For Patch Updates (Bug Fixes)

```bash
# 1. Update version
cd packages/cli
npm version patch    # 1.0.0 → 1.0.1
cd ../..

# 2. Build and publish
pnpm build
./distribution/publish-cli.sh

cd packages/cli
pnpm inject-deps

# 3. Commit and tag
git add .
git commit -m "Release v1.0.1"
git tag v1.0.1
git push && git push --tags
```

### For Minor Updates (New Features)

```bash
# 1. Update version
cd packages/cli
npm version minor    # 1.0.0 → 1.1.0
cd ../..

# 2. Build and publish
pnpm build
./distribution/publish-cli.sh

cd packages/cli
pnpm inject-deps

# 3. Update CHANGELOG.md
# 4. Commit and tag
git add .
git commit -m "Release v1.1.0"
git tag v1.1.0
git push && git push --tags
```

### For Major Updates (Breaking Changes)

```bash
# 1. Update version
cd packages/cli
npm version major    # 1.0.0 → 2.0.0
cd ../..

# 2. Build and publish
pnpm build
./distribution/publish-cli.sh

cd packages/cli
pnpm inject-deps

# 3. Update documentation with migration guide
# 4. Commit and tag
git add .
git commit -m "Release v2.0.0"
git tag v2.0.0
git push && git push --tags
```

## Success Checklist

After publishing, verify:

- Package appears on npmjs.com with correct version
- Package page shows correct description and metadata
- Files tab shows expected files (dist/, not src/)
- `npm install -g @op3/cli` works
- `npx @op3/cli` works
- `op3 --version` shows correct version
- `op3 --help` displays help
- All commands work: `init`, `run`, `once`, etc.
- Git is tagged with release version
- GitHub release created with changelog
