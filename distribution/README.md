# NGN Distribution

Publishing `@apisurf/ngn` and its sibling `@apisurf/*` packages to the public
**npm registry** using changesets.

## Prerequisites

A **granular access token** from https://www.npmjs.com/settings/~/tokens with:

- **Read and write** on the entire `@apisurf` scope. Restricting the token to
  selected packages lets it update those but not create new ones.
- **Bypass two-factor authentication** checked. It is unchecked by default, and
  without it the registry rejects every publish with `EOTP`.

`release.sh` prompts for the token and keeps it in the process environment —
nothing is written to `~/.npmrc` or the repo. Export `NPM_TOKEN` to skip the
prompt in CI.

Two quirks, both consequences of this account's `auth-and-writes` 2FA:
`release.sh` sets `CI=true` because changesets decides to prompt for an OTP from
the account's 2FA mode alone, then reuses that one code across every parallel
publish and trips `E429 rate limited otp`; and a Bypass-2FA token cannot run
`npm whoami`, so a failed check there is only a warning.

## Publishing Workflow

```bash
pnpm version:bump     # write a changeset, then bump versions
pnpm version:release  # build and publish
git push --follow-tags
```

`version:release` runs `distribution/release.sh`: prompt for the token, build
every workspace package, then `changeset publish` — which rewrites each
`workspace:*` range to the version it just published.

Publishing is per package and not atomic. Changesets skips whatever is already
on the registry, so re-running `pnpm version:release` after a partial failure
publishes only what is missing. Note that it tags all five packages regardless,
so the tags alone are not proof a release landed — check the registry.

## Local Testing (Before Publishing)

```bash
pnpm build
cd packages/ngn
npm pack --dry-run          # inspect contents
npm install -g ./apisurf-ngn-*.tgz && ngn --version
```

**Should include:** `dist/`, `LICENSE`, `README.md`, `package.json`
**Should NOT include:** `src/`, `node_modules/`, `*.ts` source files
