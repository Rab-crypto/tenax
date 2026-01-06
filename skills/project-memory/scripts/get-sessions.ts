#!/usr/bin/env bun

/**
 * Get multiple sessions by IDs or recent N sessions
 * Supports budget-aware loading
 */

import { parseArgs } from "util";
import type { ScriptOutput, ProcessedSession } from "../lib/types";
import { loadSessions, loadIndex, loadConfig, getProjectRoot, isMemoryInitialized, normalizeSessionId } from "../lib/storage";
import { countObjectTokens, formatTokenInfo } from "../lib/tokenizer";

interface SessionsOutput {
  sessions: ProcessedSession[];
  totalTokens: number;
  budgetUsed: string;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      recent: { type: "string", short: "r" },
      budget: { type: "string", short: "b" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<SessionsOutput> = {
    success: false,
    message: "",
  };

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const index = await loadIndex(projectRoot);
    const config = await loadConfig(projectRoot);
    const budget = values.budget ? parseInt(values.budget as string, 10) : config.tokenBudget;

    let sessionIds: string[];

    if (values.recent) {
      // Get recent N sessions
      const recentCount = parseInt(values.recent as string, 10);
      sessionIds = index.sessions
        .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
        .slice(0, recentCount)
        .map((s) => s.id);
    } else if (positionals.length > 0) {
      // Get specific sessions by ID
      sessionIds = positionals.map((id) => normalizeSessionId(id, config.sessionIdPadding));
    } else {
      output.message = "Usage: get-sessions.ts <id1,id2,...> or --recent N";
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }

    // Load sessions
    const allSessions = await loadSessions(sessionIds, projectRoot);

    // Budget-aware loading
    const loadedSessions: ProcessedSession[] = [];
    let totalTokens = 0;

    for (const session of allSessions) {
      const sessionTokens = countObjectTokens(session);
      if (totalTokens + sessionTokens <= budget) {
        loadedSessions.push(session);
        totalTokens += sessionTokens;
      } else {
        break;
      }
    }

    const sessionsOutput: SessionsOutput = {
      sessions: loadedSessions,
      totalTokens,
      budgetUsed: formatTokenInfo(totalTokens, budget),
    };

    output.success = true;
    output.tokenCount = totalTokens;
    output.message = `Loaded ${loadedSessions.length} of ${sessionIds.length} sessions (${formatTokenInfo(totalTokens, budget)})`;
    output.data = sessionsOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to load sessions: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
