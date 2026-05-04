#!/bin/bash

# NGN Release Script
# Publishes packages to the public npm registry via changesets.
# Requires the user to be logged in via `npm login` (or `NPM_TOKEN` exported in CI).

set -e  # Exit on any error

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

# Verify npm authentication (skip if running in CI with NPM_TOKEN configured via .npmrc)
if [[ -z "$NPM_TOKEN" ]]; then
    if ! npm whoami &> /dev/null; then
        echo -e "${RED}❌ Not logged in to npm.${NC}"
        echo -e "   Run: ${YELLOW}npm login${NC} (or export ${YELLOW}NPM_TOKEN${NC} for CI)"
        exit 1
    fi
    NPM_USER=$(npm whoami)
    echo -e "${BLUE}🔐 Authenticated to npm as: ${NPM_USER}${NC}"
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    git status --short
    echo
    read -p "Continue anyway? (y/N): " -n 1 -r
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
echo -e "  2. Inject workspace dependencies into the @apisurf/ngn package"
echo -e "  3. Publish to the public npm registry via changesets"

read -p $'\nReady to proceed? (y/N): ' -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Release cancelled${NC}"
    exit 1
fi

# Step 1: Build
echo -e "\n${YELLOW}🔨 Step 1/3: Building all packages...${NC}"
pnpm build

# Step 2: Inject deps
echo -e "\n${YELLOW}📥 Step 2/3: Injecting dependencies into @apisurf/ngn...${NC}"
pnpm --filter @apisurf/ngn inject-deps

# Step 3: Publish
echo -e "\n${YELLOW}📤 Step 3/3: Publishing via changesets...${NC}"
pnpm changeset publish

echo -e "\n${GREEN}✅ Release complete!${NC}"
echo -e "\n${BLUE}Verify on npm:${NC}"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn-plugin"
echo -e "  https://www.npmjs.com/package/@apisurf/ngn-ui"
