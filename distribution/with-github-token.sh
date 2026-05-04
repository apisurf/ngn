#!/bin/bash

# Wrapper script that securely sets GITHUB_AUTH_TOKEN and runs a command
# Usage: ./with-github-token.sh <command> [args...]

set -e

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if GITHUB_AUTH_TOKEN is already set
if [[ -n "$GITHUB_AUTH_TOKEN" ]]; then
    echo -e "${YELLOW}ℹ️  Using existing GITHUB_AUTH_TOKEN from environment${NC}\n"
else
    echo -e "${BLUE}🔐 Enter your GitHub Personal Access Token${NC}"
    echo -e "   (needs 'write:packages' scope for GitHub Packages)"
    echo -e "   Token input is hidden and won't be saved to history\n"
    
    read -s -p "GITHUB_AUTH_TOKEN: " GITHUB_AUTH_TOKEN
    echo  # New line after hidden input
    
    if [[ -z "$GITHUB_AUTH_TOKEN" ]]; then
        echo -e "\n${RED}❌ Token cannot be empty${NC}"
        exit 1
    fi
    
    export GITHUB_AUTH_TOKEN
    echo
fi

# Run the provided command
exec "$@"
