# NGN Distribution

Publishing `@apisurf/ngn` CLI to GitHub Packages using changesets.

## Publishing Workflow

```bash
# 1. Create changesets during development & bump versions
pnpm version:bump

# 3. Build, inject deps, and publish
pnpm version:release
```

### Token Handling

Both commands use `with-github-token.sh` which:

- **Securely prompts** for your GitHub token (hidden input, not saved to shell history)
- Sets the token only for child processes (won't persist after script exits)
- Reuses existing `GITHUB_AUTH_TOKEN` if already set in your environment

**Token requirements:** GitHub PAT with `write:packages` scope.

The token is never written to disk or shell history - it's only held in memory for the duration of the command.

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
