#!/usr/bin/env bun

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

interface SearchOutput {
  query: string;
  results: Array<SearchResult & { content: Decision | Pattern | Task | Insight | SessionMetadata }>;
  totalResults: number;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
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

    // Hydrate results with full content
    const hydratedResults: Array<SearchResult & { content: Decision | Pattern | Task | Insight | SessionMetadata }> = [];

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
        hydratedResults.push({
          ...result,
          content,
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
