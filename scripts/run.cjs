#!/usr/bin/env node

/**
 * Launcher script that runs TypeScript scripts using tsx.
 * This handles stdin data for hooks (tsx doesn't support direct stdin reading well).
 *
 * Usage: node run.cjs <script-name> [args...]
 *
 * Script names map to files in skills/tenax/scripts/:
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
const SCRIPTS_DIR = path.join(PLUGIN_ROOT, "skills", "tenax", "scripts");

/**
 * Read all stdin data (for hook input).
 * We read in Node and pass via temp file since tsx subprocess stdin can be tricky.
 */
async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let resolved = false;

    // Check if stdin is a TTY (interactive) - no data to read
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      if (!resolved) {
        resolved = true;
        resolve(chunks.join(""));
      }
    });
    process.stdin.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve("");
      }
    });

    // Timeout if no data received
    setTimeout(() => {
      if (!resolved && chunks.length === 0) {
        resolved = true;
        resolve("");
      }
    }, 1000);
  });
}

/**
 * Get the path to tsx executable
 */
function getTsxPath() {
  const isWindows = process.platform === "win32";

  // Try local node_modules first
  const localTsx = path.join(PLUGIN_ROOT, "node_modules", ".bin", isWindows ? "tsx.cmd" : "tsx");
  if (fs.existsSync(localTsx)) {
    return localTsx;
  }

  // Fall back to npx tsx
  return null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node run.cjs <script-name> [args...]");
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

  // Read stdin and save to temp file
  const stdinData = await readStdin();
  let tempFile = null;

  if (stdinData.trim()) {
    tempFile = path.join(os.tmpdir(), `claude-hook-input-${Date.now()}.json`);
    fs.writeFileSync(tempFile, stdinData, "utf8");
    scriptArgs.push(tempFile);
  }

  // Get tsx path
  const tsxPath = getTsxPath();

  let child;
  if (tsxPath) {
    // Use local tsx
    child = spawn(tsxPath, [scriptPath, ...scriptArgs], {
      stdio: "inherit",
      cwd: PLUGIN_ROOT,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      },
      shell: process.platform === "win32",
    });
  } else {
    // Use npx tsx
    const isWindows = process.platform === "win32";
    child = spawn(isWindows ? "npx.cmd" : "npx", ["tsx", scriptPath, ...scriptArgs], {
      stdio: "inherit",
      cwd: PLUGIN_ROOT,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      },
      shell: isWindows,
    });
  }

  child.on("error", (err) => {
    console.error(`Failed to start tsx: ${err.message}`);
    console.error("Please ensure dependencies are installed: npm install");
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
