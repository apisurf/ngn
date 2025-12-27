#!/bin/bash

# OP3 Publishing Script
# This script publishes all packages in the correct order

set -e  # Exit on any error

echo "🚀 Starting OP3 package publishing process..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to publish a package
publish_package() {
  local package_name=$1
  local package_path=$2
  
  echo -e "\n${BLUE}📦 Publishing ${package_name}...${NC}"
  cd "$package_path"
  
  # Build the package
  echo "  Building..."
  pnpm build
  
  # Publish to npm
  echo "  Publishing to npm..."
  npm publish
  
  cd - > /dev/null
  echo -e "${GREEN}✅ ${package_name} published successfully${NC}"
}

# Ensure we're in the repo root (navigate up from distribution folder)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Build all packages first
echo -e "\n${YELLOW}🔨 Building all packages...${NC}"
pnpm build

# Publish packages in dependency order
# 1. Packages with no internal dependencies
publish_package "op3-schema" "$REPO_ROOT/packages/schema"
publish_package "op3-os" "$REPO_ROOT/packages/os"

# 2. Packages depending on os
publish_package "op3-persistence" "$REPO_ROOT/packages/persistence"

# 3. Packages depending on persistence
publish_package "op3-api" "$REPO_ROOT/packages/api"

# 4. Core package (depends on os, persistence, schema)
publish_package "op3-core" "$REPO_ROOT/packages/core"

# 5. CLI package (depends on everything)
publish_package "@op3/cli" "$REPO_ROOT/packages/cli"

echo -e "\n${GREEN}🎉 All packages published successfully!${NC}"
echo -e "\n${BLUE}You can now install with:${NC}"
echo -e "  npm install -g @op3/cli"
echo -e "  or"
echo -e "  npx @op3/cli"

