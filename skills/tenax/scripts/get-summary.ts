#!/usr/bin/env bun

/**
 * Get a quick summary of Tenax
 * Returns stats and recent activity
 */

import type { ScriptOutput, Decision, Pattern, Task } from "../lib/types";
import { loadIndex, loadConfig, getProjectRoot, isMemoryInitialized, getStorageSize } from "../lib/storage";
import { countObjectTokens, formatBytes } from "../lib/tokenizer";

interface SummaryOutput {
  initialized: boolean;
  stats: {
    totalSessions: number;
    totalDecisions: number;
    totalPatterns: number;
    totalTasks: { pending: number; completed: number };
    totalInsights: number;
  };
  recentDecisions: Decision[];
  recentPatterns: Pattern[];
  pendingTasks: Task[];
  topTopics: Array<{ topic: string; count: number }>;
  storageSize: string;
}

async function main(): Promise<void> {
  const projectRoot = getProjectRoot();

  const output: ScriptOutput<SummaryOutput> = {
    success: false,
    message: "",
  };

  if (!(await isMemoryInitialized(projectRoot))) {
    output.success = true;
    output.message = "Project memory not initialized";
    output.data = {
      initialized: false,
      stats: {
        totalSessions: 0,
        totalDecisions: 0,
        totalPatterns: 0,
        totalTasks: { pending: 0, completed: 0 },
        totalInsights: 0,
      },
      recentDecisions: [],
      recentPatterns: [],
      pendingTasks: [],
      topTopics: [],
      storageSize: "0 B",
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  try {
    const index = await loadIndex(projectRoot);
    const config = await loadConfig(projectRoot);
    const storage = await getStorageSize(projectRoot);

    // Get recent decisions (last 5)
    const recentDecisions = index.decisions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    // Get recent patterns (last 3)
    const recentPatterns = index.patterns
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 3);

    // Get pending tasks
    const pendingTasks = index.tasks.filter((t) => t.status === "pending").slice(0, 5);

    // Get top topics
    const topTopics = Object.entries(index.topics)
      .map(([topic, ids]) => ({ topic, count: ids.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const summaryData: SummaryOutput = {
      initialized: true,
      stats: {
        totalSessions: index.totalSessions,
        totalDecisions: index.totalDecisions,
        totalPatterns: index.totalPatterns,
        totalTasks: index.totalTasks,
        totalInsights: index.totalInsights,
      },
      recentDecisions,
      recentPatterns,
      pendingTasks,
      topTopics,
      storageSize: formatBytes(storage.total),
    };

    output.success = true;
    output.tokenCount = countObjectTokens(summaryData);
    output.message = `Project memory: ${index.totalSessions} sessions, ${index.totalDecisions} decisions`;
    output.data = summaryData;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to get summary: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
