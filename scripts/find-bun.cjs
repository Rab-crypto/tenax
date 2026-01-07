#!/usr/bin/env node

/**
 * Postinstall script to locate Bun and cache its path.
 * This runs with Node.js (universally available) to find Bun
 * for use by the plugin hooks.
 *
 * If Bun is not found, prompts the user to install it.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const CONFIG_FILE = path.join(__dirname, "..", ".bun-path");

function findBun() {
  const isWindows = process.platform === "win32";
  const home = os.homedir();

  // Common Bun installation locations
  const candidates = isWindows
    ? [
        path.join(home, ".bun", "bin", "bun.exe"),
        path.join(process.env.LOCALAPPDATA || "", "bun", "bun.exe"),
        path.join(process.env.PROGRAMFILES || "", "bun", "bun.exe"),
      ]
    : [
        path.join(home, ".bun", "bin", "bun"),
        "/usr/local/bin/bun",
        "/opt/homebrew/bin/bun",
        "/home/linuxbrew/.linuxbrew/bin/bun",
      ];

  // Try to find bun in PATH first
  try {
    const cmd = isWindows ? "where bun 2>nul" : "which bun 2>/dev/null";
    const result = execSync(cmd, { encoding: "utf8" }).trim();
    if (result) {
      const bunPath = result.split(/\r?\n/)[0];
      if (fs.existsSync(bunPath)) {
        return bunPath;
      }
    }
  } catch {
    // Not in PATH, continue to check common locations
  }

  // Check common installation locations
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function verifyBun(bunPath) {
  try {
    const version = execSync(`"${bunPath}" --version`, {
      encoding: "utf8",
    }).trim();
    return version;
  } catch {
    return null;
  }
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function installBun() {
  const isWindows = process.platform === "win32";

  console.log("\nInstalling Bun...\n");

  return new Promise((resolve, reject) => {
    if (isWindows) {
      // Windows: Use PowerShell to install
      const ps = spawn(
        "powershell",
        ["-Command", "irm bun.sh/install.ps1 | iex"],
        { stdio: "inherit", shell: true }
      );
      ps.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Installation failed with code ${code}`));
      });
    } else {
      // macOS/Linux: Use curl
      const sh = spawn("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"], {
        stdio: "inherit",
      });
      sh.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Installation failed with code ${code}`));
      });
    }
  });
}

async function main() {
  console.log("tenax: Locating Bun installation...");

  let bunPath = findBun();

  if (bunPath) {
    const version = verifyBun(bunPath);
    if (version) {
      console.log(`tenax: Found Bun ${version} at ${bunPath}`);
      fs.writeFileSync(CONFIG_FILE, bunPath, "utf8");
      console.log(`tenax: Bun path cached successfully`);
      return;
    }
  }

  // Bun not found
  console.log("\n" + "=".repeat(60));
  console.log("Bun is required but was not found on your system.");
  console.log("Bun is a fast JavaScript runtime needed for this plugin.");
  console.log("Learn more: https://bun.sh");
  console.log("=".repeat(60) + "\n");

  const answer = await askQuestion("Would you like to install Bun now? (yes/no): ");

  if (answer === "yes" || answer === "y") {
    try {
      await installBun();

      // Try to find bun again after installation
      bunPath = findBun();

      if (!bunPath) {
        // Check the default installation path
        const home = os.homedir();
        const defaultPath = process.platform === "win32"
          ? path.join(home, ".bun", "bin", "bun.exe")
          : path.join(home, ".bun", "bin", "bun");

        if (fs.existsSync(defaultPath)) {
          bunPath = defaultPath;
        }
      }

      if (bunPath) {
        const version = verifyBun(bunPath);
        console.log(`\ntenax: Bun ${version || "(version unknown)"} installed at ${bunPath}`);
        fs.writeFileSync(CONFIG_FILE, bunPath, "utf8");
        console.log("tenax: Bun path cached successfully");
        console.log("\nNote: You may need to restart your terminal for 'bun' to be in PATH.");
      } else {
        console.error("\ntenax: Could not locate Bun after installation.");
        console.error("Please restart your terminal and run 'bun install' again.");
        process.exit(1);
      }
    } catch (err) {
      console.error("\ntenax: Failed to install Bun:", err.message);
      console.error("Please install Bun manually: https://bun.sh");
      process.exit(1);
    }
  } else {
    console.log("\ntenax: Bun is required for this plugin to function.");
    console.log("Please install Bun manually and run 'bun install' again:");
    console.log("  curl -fsSL https://bun.sh/install | bash   # macOS/Linux");
    console.log("  irm bun.sh/install.ps1 | iex               # Windows PowerShell");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("tenax: Unexpected error:", err);
  process.exit(1);
});
