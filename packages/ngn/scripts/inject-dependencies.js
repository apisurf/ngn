#!/usr/bin/env node

/**
 * This script collects dependencies from workspace packages and injects them
 * into the CLI package.json for npm distribution.
 *
 * Workspace dependencies (ngn-*) are not available on npm, so we need to
 * flatten all their dependencies into the main CLI package.
 */

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const CLI_PACKAGE_JSON_PATH = path.join(__dirname, "../package.json");

// Workspace packages that need their dependencies extracted.
// @apisurf/ngnui is excluded on purpose: it is its own published CLI with its
// own dependencies, not something the scheduler bundles.
const WORKSPACE_PACKAGES = [
  "ngn-core",
  "ngn-os",
  "ngn-persistence",
  "ngn-schema",
];

/**
 * Read a package.json file
 */
function readPackageJson(packageName) {
  const packagePath = path.join(
    WORKSPACE_ROOT,
    "packages",
    packageName.replace("ngn-", ""),
    "package.json"
  );
  try {
    const content = fs.readFileSync(packagePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.warn(
      `Warning: Could not read package.json for ${packageName}: ${error.message}`
    );
    return null;
  }
}

/**
 * Check if a dependency is a workspace dependency
 */
function isWorkspaceDependency(version) {
  return typeof version === "string" && version.startsWith("workspace:");
}

/**
 * Recursively collect all dependencies from workspace packages
 */
function collectDependencies(packageName, visited = new Set()) {
  // Avoid circular dependencies
  if (visited.has(packageName)) {
    return {};
  }
  visited.add(packageName);

  const pkg = readPackageJson(packageName);
  if (!pkg || !pkg.dependencies) {
    return {};
  }

  const collectedDeps = {};

  for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
    if (isWorkspaceDependency(depVersion)) {
      // Recursively collect dependencies from workspace packages
      if (WORKSPACE_PACKAGES.includes(depName)) {
        const nestedDeps = collectDependencies(depName, visited);
        Object.assign(collectedDeps, nestedDeps);
      }
    } else {
      // Add non-workspace dependency
      collectedDeps[depName] = depVersion;
    }
  }

  return collectedDeps;
}

/**
 * Merge dependencies with conflict resolution
 * Keeps the higher version number when conflicts occur
 */
function mergeDependencies(target, source) {
  for (const [name, version] of Object.entries(source)) {
    if (!target[name]) {
      target[name] = version;
    } else if (target[name] !== version) {
      console.log(
        `Conflict for ${name}: existing=${target[name]}, new=${version} (keeping existing)`
      );
    }
  }
  return target;
}

/**
 * Sort dependencies alphabetically
 */
function sortDependencies(deps) {
  return Object.keys(deps)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = deps[key];
      return sorted;
    }, {});
}

/**
 * Main execution
 */
function main() {
  console.log("🔍 Reading CLI package.json...");
  const cliPackageJson = JSON.parse(
    fs.readFileSync(CLI_PACKAGE_JSON_PATH, "utf8")
  );

  console.log("\n📦 Collecting dependencies from workspace packages...");
  const collectedDeps = {};

  for (const packageName of WORKSPACE_PACKAGES) {
    console.log(`  - ${packageName}`);
    const deps = collectDependencies(packageName);
    mergeDependencies(collectedDeps, deps);
  }

  console.log("\n🔄 Merging with existing dependencies...");
  // Start with existing CLI dependencies
  const finalDependencies = { ...cliPackageJson.dependencies };

  // Merge in collected dependencies
  mergeDependencies(finalDependencies, collectedDeps);

  // Sort alphabetically
  cliPackageJson.dependencies = sortDependencies(finalDependencies);

  console.log("\n💾 Writing updated package.json...");
  fs.writeFileSync(
    CLI_PACKAGE_JSON_PATH,
    JSON.stringify(cliPackageJson, null, 2) + "\n",
    "utf8"
  );

  console.log("\n✅ Successfully injected dependencies!");
  console.log(
    `   Total dependencies: ${Object.keys(cliPackageJson.dependencies).length}`
  );

  // Show what was added
  const addedDeps = Object.keys(finalDependencies).filter(
    (key) =>
      !cliPackageJson.dependencies[key] ||
      cliPackageJson.dependencies[key] !== finalDependencies[key]
  );

  if (addedDeps.length > 0) {
    console.log("\n📝 New/Updated dependencies:");
    addedDeps.forEach((dep) => {
      console.log(`   - ${dep}@${finalDependencies[dep]}`);
    });
  }
}

// Run the script
try {
  main();
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
