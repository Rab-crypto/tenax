#!/usr/bin/env bun

/**
 * Add a new insight
 */

import { parseArgs } from "util";
import type { ScriptOutput, Insight, EmbeddingEntry } from "../lib/types";
import {
  loadIndex,
  saveIndex,
  loadConfig,
  getProjectRoot,
  isMemoryInitialized,
  initializeMemoryDirectory,
  generateId,
  getEmbeddingsDbPath,
} from "../lib/storage";
import { createVectorStore } from "../lib/vector-store";
import { getEmbedding, createInsightText } from "../lib/embeddings";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      context: { type: "string", short: "c" },
      session: { type: "string", short: "s" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<Insight> = {
    success: false,
    message: "",
  };

  const content = positionals.join(" ");
  const context = values.context as string | undefined;
  const sessionId = (values.session as string) || "manual";

  if (!content) {
    output.message = 'Usage: add-insight.ts "<content>" [-c context]';
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    await initializeMemoryDirectory(projectRoot);
  }

  try {
    const config = await loadConfig(projectRoot);
    const index = await loadIndex(projectRoot);

    const insight: Insight = {
      id: generateId(),
      content,
      context,
      sessionId,
      timestamp: new Date().toISOString(),
    };

    // Generate embedding
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const text = createInsightText(insight);
    const embedding = await getEmbedding(text, config.embeddingModel);

    const entry: EmbeddingEntry = {
      id: insight.id,
      type: "insight",
      text,
      sessionId,
    };

    await vectorStore.insert(entry, embedding);
    vectorStore.close();

    // Update index
    index.insights.push(insight);
    index.totalInsights += 1;

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Insight added`;
    output.data = insight;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to add insight: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
