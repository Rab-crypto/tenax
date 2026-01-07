#!/usr/bin/env tsx

/**
 * Semantic search across all Tenax
 * Returns ranked results with token counts
 */

import { parseArgs } from "util";
import type { ScriptOutput, SearchResult, Decision, Pattern, Task, Insight, SessionMetadata } from "../lib/types";
import { loadIndex, loadConfig, getEmbeddingsDbPath, getProjectRoot, isMemoryInitialized } from "../lib/storage";
import { createVectorStore } from "../lib/vector-store";
import { getEmbedding } from "../lib/embeddings";
import { countObjectTokens, formatTokenInfo } from "../lib/tokenizer";

/**
 * Convert timestamp to relative time string
 */
function timeAgo(timestamp: string | Date): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}min ago`;
  if (hours < 24) return `${hours}hr ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (weeks < 4) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

interface SearchOutput {
  query: string;
  results: Array<SearchResult & { content: Decision | Pattern | Task | Insight | SessionMetadata; timeAgo: string }>;
  totalResults: number;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      type: { type: "string", short: "t" },
      limit: { type: "string", short: "l" },
    },
    strict: false,
    allowPositionals: true,
  });

  const query = positionals.join(" ");
  const typeFilter = values.type as string | undefined;
  const limit = values.limit ? parseInt(values.limit as string, 10) : 10;

  const output: ScriptOutput<SearchOutput> = {
    success: false,
    message: "",
  };

  if (!query) {
    output.message = "Usage: search.ts <query> [-t type] [-l limit]";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized. Run init.ts first.";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const config = await loadConfig(projectRoot);
    const index = await loadIndex(projectRoot);

    // Generate query embedding
    const queryEmbedding = await getEmbedding(query, config.embeddingModel);

    // Search vector store
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const results = await vectorStore.search(queryEmbedding, limit, typeFilter);
    vectorStore.close();

    // Hydrate results with full content and relative timestamps
    const hydratedResults: Array<SearchResult & { content: Decision | Pattern | Task | Insight | SessionMetadata; timeAgo: string }> = [];

    for (const result of results) {
      let content: Decision | Pattern | Task | Insight | SessionMetadata | undefined;

      switch (result.type) {
        case "decision":
          content = index.decisions.find((d) => d.id === result.id);
          break;
        case "pattern":
          content = index.patterns.find((p) => p.id === result.id);
          break;
        case "task":
          content = index.tasks.find((t) => t.id === result.id);
          break;
        case "insight":
          content = index.insights.find((i) => i.id === result.id);
          break;
        case "session":
          // Session ID format: "session-001"
          const sessionId = result.id.replace("session-", "");
          content = index.sessions.find((s) => s.id === sessionId);
          break;
      }

      if (content) {
        // Get timestamp from content (all types have timestamp field)
        const timestamp = (content as { timestamp?: string }).timestamp || new Date().toISOString();
        hydratedResults.push({
          ...result,
          content,
          timeAgo: timeAgo(timestamp),
        });
      }
    }

    const searchOutput: SearchOutput = {
      query,
      results: hydratedResults,
      totalResults: hydratedResults.length,
    };

    output.success = true;
    output.tokenCount = countObjectTokens(searchOutput);
    output.message = `Found ${hydratedResults.length} results for "${query}"`;
    output.data = searchOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Search failed: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
