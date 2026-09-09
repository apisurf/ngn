#!/bin/bash

# NGN Release Script
# Publishes packages to the public npm registry via changesets.
#
# Auth: prompts for a granular access token at runtime and keeps it in the
# process environment only — nothing is written to ~/.npmrc or the repo.
# The token needs "Read and write" on the whole @apisurf scope and "Bypass
# two-factor authentication" checked. See distribution/README.md.
# In CI, export NPM_TOKEN instead and the prompt is skipped.

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 NGN Release Script${NC}\n"

# Ensure we're in the repo root
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# --- Authentication -------------------------------------------------------

if [[ -z "${NPM_TOKEN:-}" ]]; then
    echo -e "${BLUE}🔐 Paste an npm granular access token for the @apisurf scope${NC}"
    echo -e "   Needs ${YELLOW}Read and write${NC} on the whole scope and ${YELLOW}Bypass 2FA${NC} enabled."
    echo -e "   (input is hidden; it is never written to disk)"
    read -rsp "   Token: " NPM_TOKEN
    echo
    if [[ -z "$NPM_TOKEN" ]]; then
        echo -e "${RED}❌ No token entered${NC}"
        exit 1
    fi
fi
export NPM_TOKEN

# npm expands ${NPM_TOKEN} when it reads this file, so the file holds only the
# variable reference — the secret stays in the environment. Pointing npm here
# via userconfig also sidesteps whatever token ~/.npmrc carries.
NPMRC="$(mktemp -t ngn-release-npmrc)"
chmod 600 "$NPMRC"
trap 'rm -f "$NPMRC"' EXIT INT TERM
printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > "$NPMRC"
export NPM_CONFIG_USERCONFIG="$NPMRC"

# Not fatal: a Bypass-2FA token is barred from account-identity actions, so
# `npm whoami` can fail for a token that publishes fine.
if NPM_USER=$(npm whoami 2>/dev/null); then
    echo -e "${BLUE}🔐 Authenticated to npm as: ${NPM_USER}${NC}"
else
    echo -e "${YELLOW}⚠️  Could not read the account name with this token.${NC}"
    echo -e "   Expected for a Bypass-2FA token; the publish step will verify it."
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    git status --short
    echo
    read -rp "Continue anyway? (y/N): " -n 1
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Release cancelled${NC}"
        exit 1
    fi
fi

# Get current NGN version
CURRENT_VERSION=$(node -p "require('./packages/ngn/package.json').version")
echo -e "${BLUE}📦 Current @apisurf/ngn version: ${CURRENT_VERSION}${NC}"

# Show what will happen
echo -e "\n${YELLOW}This will:${NC}"
echo -e "  1. Build all packages"
echo -e "  2. Publish to the public npm registry via changesets"

read -rp $'\nReady to proceed? (y/N): ' -n 1
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Release cancelled${NC}"
    exit 1
fi

# Step 1: Build
echo -e "\n${YELLOW}🔨 Step 1/2: Building all packages...${NC}"
pnpm build

# Step 2: Publish
# changeset publish rewrites each `workspace:*` range to the concrete version
# it just published, so the packages resolve each other from npm.
#
# CI=true suppresses the OTP prompt changesets shows whenever the account's 2FA
# mode is "auth-and-writes"; the token already authenticates the write.
echo -e "\n${YELLOW}📤 Step 2/2: Publishing via changesets...${NC}"
CI=true pnpm changeset publish

echo -e "\n${GREEN}✅ Release complete!${NC}"
echo -e "\n${BLUE}Verify on npm:${NC}"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn-core"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn-os"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn-persistence"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn-schema"
