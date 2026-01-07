#!/usr/bin/env tsx

/**
 * Get a single session by ID
 * Returns full processed session data with token count
 */

import { parseArgs } from "util";
import type { ScriptOutput, ProcessedSession } from "../lib/types";
import { loadSession, getProjectRoot, isMemoryInitialized, normalizeSessionId, loadConfig } from "../lib/storage";
import { countObjectTokens, formatTokenInfo } from "../lib/tokenizer";

async function main(): Promise<void> {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    strict: false,
    allowPositionals: true,
  });

  const sessionId = positionals[0];

  const output: ScriptOutput<ProcessedSession> = {
    success: false,
    message: "",
  };

  if (!sessionId) {
    output.message = "Usage: get-session.ts <session-id>";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const config = await loadConfig(projectRoot);
    // Normalize session ID using configured padding (e.g., "1" -> "001")
    const paddedId = normalizeSessionId(sessionId, config.sessionIdPadding);
    const session = await loadSession(paddedId, projectRoot);

    if (!session) {
      output.message = `Session ${paddedId} not found`;
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }

    output.success = true;
    output.tokenCount = countObjectTokens(session);
    output.message = `Session ${paddedId}: ${session.metadata.summary.substring(0, 100)}...`;
    output.data = session;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to load session: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
