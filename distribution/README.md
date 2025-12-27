# op3 Distribution

This folder contains documentation and scripts for publishing the op3 CLI package to npm.

## 📖 Documentation

**[PUBLISHING-GUIDE.md](PUBLISHING-GUIDE.md)** ⭐ - Complete publishing guide

## 🛠️ Publishing Scripts

### `publish-cli.sh` ⭐ Recommended

Publishes only the CLI package (with bundled dependencies):

```bash
./distribution/publish-cli.sh
```

**What it does:**

- Checks npm login status
- Builds all packages
- Tests package contents
- Asks for confirmation
- Publishes `@op3/cli` to npm

### Updating & Republishing

```bash
# 1. Update version
cd packages/cli && npm version patch && cd ../..

# 2. Build and publish
pnpm build && ./distribution/publish-cli.sh

# 3. Tag release
git add . && git commit -m "Release v1.0.1" && git tag v1.0.1 && git push --tags
```

## 🎯 What Users Get

After you publish, users can install with:

```bash
# Global installation
npm install -g @op3/cli

# Or use without installing
npx @op3/cli
```

Then they can use commands like:

```bash
op3 --version
op3 init
op3 add test.ts
op3 run # run all
op3 run test.ts # run by glob match
op3 once test.ts # run once
op3 http # run only UI + API
```
