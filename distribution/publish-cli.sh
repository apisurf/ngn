#!/bin/bash

# Simple OP3 CLI Publishing Script
# Since CLI bundles all dependencies, we only need to publish this one package

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Publishing @op3/cli...${NC}\n"

# Ensure we're in the repo root (navigate up from distribution folder)
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Check if logged in to npm
if ! npm whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged in to npm. Please run: npm login${NC}"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./packages/cli/package.json').version")
echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"

# Build all packages (CLI needs built dependencies)
echo -e "\n${YELLOW}🔨 Building all packages...${NC}"
pnpm build

# Test pack (optional but recommended)
echo -e "\n${YELLOW}📦 Testing package contents...${NC}"
cd packages/cli
npm pack --dry-run

# Ask for confirmation
echo -e "\n${YELLOW}Ready to publish @op3/cli@${CURRENT_VERSION}${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Publishing cancelled${NC}"
    exit 1
fi

# Publish
echo -e "\n${BLUE}📤 Publishing to npm...${NC}"
npm publish

echo -e "\n${GREEN}✅ Successfully published @op3/cli@${CURRENT_VERSION}!${NC}"
echo -e "\n${BLUE}Installation:${NC}"
echo -e "  npm install -g @op3/cli"
echo -e "\n${BLUE}Or use without installing:${NC}"
echo -e "  npx @op3/cli"
echo -e "\n${BLUE}Verify on npm:${NC}"
echo -e "  https://www.npmjs.com/package/@op3/cli"

