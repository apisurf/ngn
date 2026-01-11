#!/bin/bash

# NGN CLI Publishing Script for GitHub Packages
# Publishes @apisurf/ngn to GitHub npm registry

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Publishing @apisurf/ngn to GitHub Packages...${NC}\n"

# Ensure we're in the repo root (navigate up from distribution folder)
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Check for GitHub token
if [ -z "$GITHUB_AUTH_TOKEN" ]; then
    echo -e "${RED}❌ GITHUB_AUTH_TOKEN environment variable is not set${NC}"
    echo -e "${YELLOW}Please set it with: export GITHUB_AUTH_TOKEN=your_token${NC}"
    echo -e "${YELLOW}You can create a token at: https://github.com/settings/tokens${NC}"
    echo -e "${YELLOW}Required scope: write:packages${NC}"
    exit 1
fi

# Verify .npmrc exists in packages/cli
if [ ! -f "packages/cli/.npmrc" ]; then
    echo -e "${RED}❌ .npmrc not found in packages/cli${NC}"
    exit 1
fi

echo -e "${GREEN}✓ GitHub auth token found${NC}"
echo -e "${GREEN}✓ .npmrc configuration found${NC}"

# Get current version
CURRENT_VERSION=$(node -p "require('./packages/cli/package.json').version")
echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"

# Build all packages (CLI needs built dependencies)
echo -e "\n${YELLOW}🔨 Building all packages...${NC}"
pnpm build

# currently done in the package.json => version:release script
# Inject dependencies from workspace packages into CLI package.json
# echo -e "\n${YELLOW}📥 Injecting workspace dependencies...${NC}"
# node packages/cli/scripts/inject-dependencies.js

# Test pack (optional but recommended)
echo -e "\n${YELLOW}📦 Testing package contents...${NC}"
cd packages/cli
npm pack --dry-run

# Ask for confirmation
echo -e "\n${YELLOW}Ready to publish @apisurf/ngn@${CURRENT_VERSION} to GitHub Packages${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Publishing cancelled${NC}"
    exit 1
fi

# Publish to GitHub Packages
echo -e "\n${BLUE}📤 Publishing to GitHub Packages...${NC}"
npm publish --registry=https://npm.pkg.github.com

echo -e "\n${GREEN}✅ Successfully published @apisurf/ngn@${CURRENT_VERSION} to GitHub Packages!${NC}"
echo -e "\n${BLUE}Installation (requires GitHub auth):${NC}"
echo -e "  npm install @apisurf/ngn --registry=https://npm.pkg.github.com"
echo -e "\n${BLUE}Or add to .npmrc:${NC}"
echo -e "  @apisurf:registry=https://npm.pkg.github.com"
echo -e "\n${BLUE}View package:${NC}"
echo -e "  https://github.com/apisurf/ngn/packages"
