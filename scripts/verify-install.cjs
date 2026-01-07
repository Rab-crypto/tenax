#!/usr/bin/env node

/**
 * Postinstall script to verify dependencies are correctly installed.
 * Checks that Node.js version is sufficient and better-sqlite3 can load.
 */

const fs = require("fs");
const path = require("path");

const MIN_NODE_VERSION = 18;

function checkNodeVersion() {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0], 10);

  if (major < MIN_NODE_VERSION) {
    console.error(`tenax: Node.js ${MIN_NODE_VERSION}+ required (found ${version})`);
    console.error("Please upgrade Node.js: https://nodejs.org");
    return false;
  }

  return true;
}

function checkBetterSqlite3() {
  try {
    require("better-sqlite3");
    return true;
  } catch (err) {
    console.error("tenax: Failed to load better-sqlite3");
    console.error("This may require a rebuild: npm rebuild better-sqlite3");
    console.error(`Error: ${err.message}`);
    return false;
  }
}

function checkTsx() {
  const tsxPath = path.join(__dirname, "..", "node_modules", ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx");

  if (!fs.existsSync(tsxPath)) {
    console.error("tenax: tsx not found in node_modules");
    return false;
  }

  return true;
}

function main() {
  console.log("tenax: Verifying installation...");

  const nodeOk = checkNodeVersion();
  const sqliteOk = checkBetterSqlite3();
  const tsxOk = checkTsx();

  if (nodeOk && sqliteOk && tsxOk) {
    console.log("tenax: Installation verified successfully");
    console.log(`  Node.js: ${process.versions.node}`);
    console.log("  better-sqlite3: OK");
    console.log("  tsx: OK");
  } else {
    console.error("\ntenax: Installation verification failed");
    process.exit(1);
  }
}

main();
