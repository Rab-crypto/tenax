#!/usr/bin/env node

/**
 * Ensures plugin dependencies are installed.
 * This script uses ONLY built-in Node.js modules so it can run
 * even when node_modules doesn't exist.
 *
 * Runs as a SessionStart hook to auto-install dependencies on first use.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PLUGIN_ROOT = path.join(__dirname, "..");
const NODE_MODULES = path.join(PLUGIN_ROOT, "node_modules");
const MARKER_PKG = path.join(NODE_MODULES, "@huggingface", "transformers");

/**
 * Check if dependencies are installed by looking for a key package
 */
function depsInstalled() {
  return fs.existsSync(MARKER_PKG);
}

/**
 * Run npm install in the plugin directory
 */
function installDeps() {
  const isWindows = process.platform === "win32";
  const npm = isWindows ? "npm.cmd" : "npm";

  try {
    execSync(`${npm} install`, {
      cwd: PLUGIN_ROOT,
      stdio: "inherit",
      timeout: 120000, // 2 minute timeout
    });
    return true;
  } catch (err) {
    console.error(`Failed to install dependencies: ${err.message}`);
    return false;
  }
}

function main() {
  if (depsInstalled()) {
    // Dependencies already installed, nothing to do
    process.exit(0);
  }

  console.log("");
  console.log("Tenax: Installing dependencies (first-time setup)...");
  console.log("");

  const success = installDeps();

  if (success && depsInstalled()) {
    console.log("");
    console.log("Tenax: Dependencies installed successfully!");
    console.log("");
    process.exit(0);
  } else {
    console.error("");
    console.error("Tenax: Failed to install dependencies.");
    console.error("Please run manually: npm install");
    console.error(`In directory: ${PLUGIN_ROOT}`);
    console.error("");
    // Exit with error to block session until fixed
    process.exit(1);
  }
}

main();
