#!/usr/bin/env bun

/**
 * Clear ALL session data and start completely fresh
 */

import { join } from "node:path";
import { readdir, unlink, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DEFAULT_INDEX } from "../skills/project-memory/lib/types";
import {
  getMemoryPath,
  getSessionsPath,
  getIndexPath,
  getEmbeddingsDbPath,
} from "../skills/project-memory/lib/storage";

const projectRoot = process.cwd();

async function main() {
  console.log("=== Clearing ALL Session Data ===\n");

  const memoryPath = getMemoryPath(projectRoot);
  const sessionsPath = getSessionsPath(projectRoot);
  const indexPath = getIndexPath(projectRoot);
  const embeddingsPath = getEmbeddingsDbPath(projectRoot);

  // Step 1: Delete all files in sessions directory
  console.log("Step 1: Clearing sessions directory...");
  if (existsSync(sessionsPath)) {
    const files = await readdir(sessionsPath);
    for (const file of files) {
      await unlink(join(sessionsPath, file));
      console.log(`  Deleted ${file}`);
    }
  }
  console.log();

  // Step 2: Reset index
  console.log("Step 2: Resetting index...");
  const newIndex = {
    ...DEFAULT_INDEX,
    projectPath: projectRoot,
    lastUpdated: new Date().toISOString(),
  };
  await writeFile(indexPath, JSON.stringify(newIndex, null, 2));
  console.log("  Index reset to defaults");
  console.log();

  // Step 3: Delete embeddings database
  console.log("Step 3: Clearing embeddings database...");
  try {
    if (existsSync(embeddingsPath)) {
      await unlink(embeddingsPath);
      console.log("  Embeddings database deleted");
    } else {
      console.log("  No existing embeddings database");
    }
  } catch (e) {
    console.log("  Could not delete embeddings database");
  }
  console.log();

  console.log("=== All Data Cleared ===");
  console.log("\nProject memory is now empty and ready for new sessions.");
  console.log("New sessions will use the marker format for reliable extraction:");
  console.log("  [DECISION: topic] decision text");
  console.log("  [PATTERN: name] pattern description");
  console.log("  [TASK: priority] task description");
  console.log("  [INSIGHT] insight text");
}

main().catch(console.error);
