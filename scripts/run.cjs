#!/usr/bin/env node

/**
 * Launcher script that runs Bun scripts using the cached Bun path.
 * This allows hooks to work regardless of whether Bun is in PATH.
 *
 * Usage: node run.js <script-name> [args...]
 *
 * Script names map to files in skills/project-memory/scripts/:
 *   - capture-session -> capture-session.ts
 *   - track-file -> track-file.ts
 *   - search -> search.ts
 *   - etc.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PLUGIN_ROOT = path.join(__dirname, "..");
const BUN_PATH_FILE = path.join(PLUGIN_ROOT, ".bun-path");
const SCRIPTS_DIR = path.join(PLUGIN_ROOT, "skills", "project-memory", "scripts");

function getBunPath() {
  // Try cached path first
  if (fs.existsSync(BUN_PATH_FILE)) {
    const cachedPath = fs.readFileSync(BUN_PATH_FILE, "utf8").trim();
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }
  }

  // Fallback: try to find bun in common locations
  const isWindows = process.platform === "win32";
  const home = require("os").homedir();

  const candidates = isWindows
    ? [
        path.join(home, ".bun", "bin", "bun.exe"),
        "bun.exe",
        "bun",
      ]
    : [
        path.join(home, ".bun", "bin", "bun"),
        "/usr/local/bin/bun",
        "/opt/homebrew/bin/bun",
        "bun",
      ];

  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Last resort
  return "bun";
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node run.js <script-name> [args...]");
    console.error("Available scripts: capture-session, track-file, search, init, stats");
    process.exit(1);
  }

  const scriptName = args[0];
  const scriptArgs = args.slice(1);

  // Resolve script path
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptName}.ts`);

  if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  const bunPath = getBunPath();

  // Spawn bun with the script
  const child = spawn(bunPath, [scriptPath, ...scriptArgs], {
    stdio: "inherit",
    cwd: PLUGIN_ROOT,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    },
  });

  child.on("error", (err) => {
    console.error(`Failed to start Bun: ${err.message}`);
    console.error("Please ensure Bun is installed: https://bun.sh");
    process.exit(1);
  });

  child.on("close", (code) => {
    process.exit(code || 0);
  });
}

main();
