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
const os = require("os");

const PLUGIN_ROOT = path.join(__dirname, "..");
const BUN_PATH_FILE = path.join(PLUGIN_ROOT, ".bun-path");
const SCRIPTS_DIR = path.join(PLUGIN_ROOT, "skills", "project-memory", "scripts");

/**
 * Read all stdin data (for hook input).
 * Bun.stdin.text() hangs in subprocesses, so we read in Node and pass via temp file.
 */
async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];

    // Check if stdin is a TTY (interactive) - no data to read
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", () => resolve(""));

    // Timeout after 100ms if no data (stdin might be empty)
    setTimeout(() => {
      if (chunks.length === 0) {
        resolve("");
      }
    }, 100);
  });
}

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

async function main() {
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

  // Read stdin and save to temp file (Bun.stdin.text() hangs in subprocesses)
  const stdinData = await readStdin();
  let tempFile = null;

  if (stdinData.trim()) {
    tempFile = path.join(os.tmpdir(), `claude-hook-input-${Date.now()}.json`);
    fs.writeFileSync(tempFile, stdinData, "utf8");
    scriptArgs.push(tempFile);
  }

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
    if (tempFile) fs.unlinkSync(tempFile);
    process.exit(1);
  });

  child.on("close", (code) => {
    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error("Launcher error:", err);
  process.exit(1);
});
