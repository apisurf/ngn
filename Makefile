# Development and release tasks. Run `make` to see them all.

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install dev ui ngnui build lint typecheck test format format-check check \
	changeset version release

# Sections come from `##@ Name` lines, targets from `target: ## description`.
# Colors only when stdout is a terminal and NO_COLOR is unset.
help:
	@if [ -t 1 ] && [ -z "$${NO_COLOR:-}" ]; then \
		bold=$$'\033[1m'; dim=$$'\033[2m'; cyan=$$'\033[36m'; reset=$$'\033[0m'; \
	fi; \
	printf "%sngn%s %s· schedule Node tasks, record every run, browse them%s\n\n" "$$bold" "$$reset" "$$dim" "$$reset"; \
	printf "Usage: make %s<target>%s\n" "$$cyan" "$$reset"; \
	awk -v bold="$$bold" -v cyan="$$cyan" -v reset="$$reset" ' \
		/^##@ / { printf "\n%s%s%s\n", bold, substr($$0, 5), reset; next } \
		/^[a-zA-Z0-9_-]+:.*## / { \
			split($$0, parts, ":.*## "); \
			printf "  %s%-14s%s %s\n", cyan, parts[1], reset, parts[2] \
		}' $(MAKEFILE_LIST); \
	printf "\n%sRelease workflow%s\n" "$$bold" "$$reset"; \
	printf "  1. %smake changeset%s    describe the change and pick patch, minor or major\n" "$$cyan" "$$reset"; \
	printf "  2. %smake version%s      apply pending changesets: bump versions, write CHANGELOGs\n" "$$cyan" "$$reset"; \
	printf "  3. %sgit add -A && git commit -m \"Version x.y.z\"%s\n" "$$cyan" "$$reset"; \
	printf "  4. %smake release%s      check, build, publish to npm and tag\n" "$$cyan" "$$reset"; \
	printf "  5. %sgit push --follow-tags%s\n" "$$cyan" "$$reset"

##@ Development

install: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

dev: ## Rebuild every package on change
	pnpm dev

# NGN_DB must be absolute: the dev server runs with packages/ui as its cwd.
ui: ## Start the ngnui dev server (NGN_DB=/abs/ngn.sqlite, NGN_LIVE=http://127.0.0.1:4545)
	pnpm ui

ngnui: ## Run the built ngnui (ARGS="--db ./ngn.sqlite --live http://127.0.0.1:4545")
	pnpm ngnui $(ARGS)

build: ## Build every package
	pnpm build

lint: ## Lint every package with oxlint
	pnpm lint

typecheck: ## Typecheck every package
	pnpm typecheck

test: ## Run every test suite
	pnpm test

format: ## Format the repo with oxfmt
	pnpm fmt

format-check: ## Check formatting without writing
	pnpm fmt:check

check: ## Lint, typecheck, test, check formatting and build
	pnpm lint
	pnpm typecheck
	pnpm test
	pnpm fmt:check
	pnpm build

##@ Release

changeset: ## Record a change for the next release
	pnpm changeset

version: ## Apply pending changesets to versions and CHANGELOGs
	pnpm changeset version

# Refuses a dirty tree because `changeset publish` tags whatever commit is checked out.
# distribution/release.sh asks for the token and publishes; see distribution/README.md.
release: ## Publish every version not yet on npm (asks for a token)
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Working tree is dirty: commit the version bump before releasing."; exit 1; \
	fi
	@if ls .changeset/*.md 2>/dev/null | grep -qv README.md; then \
		echo "Unapplied changesets: run 'make version' and commit first."; exit 1; \
	fi
	@$(MAKE) --no-print-directory check
	./distribution/release.sh
