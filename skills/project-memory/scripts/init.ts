#!/usr/bin/env bun

/**
 * Initialize project memory directory structure
 * Creates .claude/project-memory/ with config.json and index.json
 */

import {
  initializeMemoryDirectory,
  isMemoryInitialized,
  getMemoryPath,
  saveConfig,
  saveIndex,
  getProjectRoot,
} from "../lib/storage";
import { DEFAULT_CONFIG, DEFAULT_INDEX, type ScriptOutput } from "../lib/types";

async function main(): Promise<void> {
  const projectRoot = getProjectRoot();

  const output: ScriptOutput = {
    success: false,
    message: "",
  };

  try {
    // Check if already initialized
    if (await isMemoryInitialized(projectRoot)) {
      output.success = true;
      output.message = `Project memory already initialized at ${getMemoryPath(projectRoot)}`;
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Create directory structure
    await initializeMemoryDirectory(projectRoot);

    // Create default config
    await saveConfig(DEFAULT_CONFIG, projectRoot);

    // Create empty index
    const index = {
      ...DEFAULT_INDEX,
      projectPath: projectRoot,
      lastUpdated: new Date().toISOString(),
    };
    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Project memory initialized at ${getMemoryPath(projectRoot)}`;
    output.data = {
      configPath: `${getMemoryPath(projectRoot)}/config.json`,
      indexPath: `${getMemoryPath(projectRoot)}/index.json`,
      sessionsPath: `${getMemoryPath(projectRoot)}/sessions/`,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to initialize project memory: ${error instanceof Error ? error.message : String(error)}`;
    console.error(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
