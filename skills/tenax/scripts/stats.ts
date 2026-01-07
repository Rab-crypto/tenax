#!/usr/bin/env tsx

/**
 * Generate detailed statistics about Tenax
 */

import type { ScriptOutput, MemoryStats } from "../lib/types";
import { loadIndex, getProjectRoot, isMemoryInitialized, getStorageSize } from "../lib/storage";
import { countObjectTokens, formatBytes } from "../lib/tokenizer";

async function main(): Promise<void> {
  const projectRoot = getProjectRoot();

  const output: ScriptOutput<MemoryStats> = {
    success: false,
    message: "",
  };

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const index = await loadIndex(projectRoot);
    const storage = await getStorageSize(projectRoot);

    // Calculate sessions per month
    const monthCounts: Record<string, number> = {};
    for (const session of index.sessions) {
      const date = new Date(session.endTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
    }

    const sessionsPerMonth = Object.entries(monthCounts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate top topics
    const topTopics = Object.entries(index.topics)
      .map(([topic, ids]) => ({ topic, count: ids.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate total tokens
    let totalTokens = 0;
    for (const session of index.sessions) {
      totalTokens += session.tokenCount || 0;
    }

    // Get oldest and newest sessions
    const sortedSessions = [...index.sessions].sort(
      (a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
    );

    // Count cancelled tasks
    const cancelledTasks = index.tasks.filter((t) => t.status === "cancelled").length;

    const stats: MemoryStats = {
      totalSessions: index.totalSessions,
      totalDecisions: index.totalDecisions,
      totalPatterns: index.totalPatterns,
      totalTasks: {
        pending: index.totalTasks.pending,
        completed: index.totalTasks.completed,
        cancelled: cancelledTasks,
      },
      totalInsights: index.totalInsights,
      totalTokens,
      oldestSession: sortedSessions[0]?.endTime,
      newestSession: sortedSessions[sortedSessions.length - 1]?.endTime,
      topTopics,
      sessionsPerMonth,
      storageSize: {
        index: storage.index,
        sessions: storage.sessions,
        embeddings: storage.embeddings,
        total: storage.total,
      },
    };

    output.success = true;
    output.tokenCount = countObjectTokens(stats);
    output.message = `Stats for ${index.totalSessions} sessions`;
    output.data = stats;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
