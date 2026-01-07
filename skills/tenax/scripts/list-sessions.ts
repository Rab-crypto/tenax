#!/usr/bin/env tsx

/**
 * List all sessions with metadata
 * Shows session ID, date, summary, and token count
 */

import type { ScriptOutput, SessionMetadata } from "../lib/types";
import { loadIndex, getProjectRoot, isMemoryInitialized } from "../lib/storage";
import { countObjectTokens } from "../lib/tokenizer";

interface ListOutput {
  sessions: Array<
    SessionMetadata & {
      tokenCount: number;
    }
  >;
  totalSessions: number;
}

async function main(): Promise<void> {
  const projectRoot = getProjectRoot();

  const output: ScriptOutput<ListOutput> = {
    success: false,
    message: "",
  };

  if (!(await isMemoryInitialized(projectRoot))) {
    output.success = true;
    output.message = "No sessions found (Tenax not initialized)";
    output.data = {
      sessions: [],
      totalSessions: 0,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  try {
    const index = await loadIndex(projectRoot);

    // Sort sessions by date (newest first)
    const sortedSessions = [...index.sessions].sort(
      (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
    );

    const sessionsWithTokens = sortedSessions.map((session) => ({
      ...session,
      tokenCount: session.tokenCount || countObjectTokens(session),
    }));

    const listOutput: ListOutput = {
      sessions: sessionsWithTokens,
      totalSessions: sessionsWithTokens.length,
    };

    output.success = true;
    output.tokenCount = countObjectTokens(listOutput);
    output.message = `Found ${sessionsWithTokens.length} sessions`;
    output.data = listOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
