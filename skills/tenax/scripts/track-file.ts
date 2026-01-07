#!/usr/bin/env tsx

/**
 * Track file modifications from PostToolUse hook
 * Logs Edit/Write/MultiEdit operations for later session processing
 */

import { readFile, access } from "node:fs/promises";
import type { HookInput } from "../lib/types";
import {
  appendTempFileChange,
  initializeMemoryDirectory,
  isMemoryInitialized,
  type TempFileChange,
} from "../lib/storage";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  try {
    // Read hook input from file argument (passed by run.cjs)
    let stdin: string;

    const inputArg = process.argv[2];
    if (inputArg && inputArg.endsWith(".json")) {
      if (await fileExists(inputArg)) {
        stdin = await readFile(inputArg, "utf8");
      } else {
        process.exit(0);
      }
    } else {
      process.exit(0);
    }

    if (!stdin.trim()) {
      process.exit(0);
    }

    const input: HookInput = JSON.parse(stdin);

    // Only process PostToolUse events
    if (input.hook_event_name !== "PostToolUse") {
      process.exit(0);
    }

    // Only track file modification tools
    const toolName = input.tool_name || "";
    if (!["Write", "Edit", "MultiEdit"].includes(toolName)) {
      process.exit(0);
    }

    const projectRoot = input.cwd;

    // Initialize memory if needed
    if (!(await isMemoryInitialized(projectRoot))) {
      await initializeMemoryDirectory(projectRoot);
    }

    // Extract file path from tool input
    const toolInput = input.tool_input || {};
    const filePath = (toolInput.file_path || toolInput.path) as string | undefined;

    if (!filePath) {
      process.exit(0);
    }

    // Determine action
    const toolResponse = input.tool_response || {};
    const isNewFile = toolName === "Write" && !toolResponse.existed;
    const action = isNewFile ? "created" : "modified";

    // Create file change record
    const change: TempFileChange = {
      path: filePath,
      action,
      timestamp: new Date().toISOString(),
      toolName,
    };

    // Append to temp file
    await appendTempFileChange(change, projectRoot);

    process.exit(0);
  } catch (error) {
    // Silently fail - don't interrupt the user's work
    console.error("Error tracking file:", error);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Error in track-file:", error);
  process.exit(0);
});
