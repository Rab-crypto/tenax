#!/usr/bin/env tsx

/**
 * Record a new pattern
 * Args: name, description, usage
 */

import { parseArgs } from "util";
import type { ScriptOutput, Pattern, EmbeddingEntry } from "../lib/types";
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
import { getEmbedding, createPatternText } from "../lib/embeddings";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      name: { type: "string", short: "n" },
      usage: { type: "string", short: "u" },
      session: { type: "string", short: "s" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<Pattern> = {
    success: false,
    message: "",
  };

  const description = positionals.join(" ");
  const name = values.name as string | undefined;
  const usage = values.usage as string | undefined;
  const sessionId = (values.session as string) || "manual";

  if (!description || !name) {
    output.message = 'Usage: record-pattern.ts -n <name> -u <usage> "<description>"';
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

    const pattern: Pattern = {
      id: generateId(),
      name,
      description,
      usage: usage || "",
      sessionId,
      timestamp: new Date().toISOString(),
    };

    // Generate embedding
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const text = createPatternText(pattern);
    const embedding = await getEmbedding(text, config.embeddingModel);

    const entry: EmbeddingEntry = {
      id: pattern.id,
      type: "pattern",
      text,
      sessionId,
    };

    await vectorStore.insert(entry, embedding);
    vectorStore.close();

    // Update index
    index.patterns.push(pattern);
    index.totalPatterns += 1;

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Pattern recorded: ${name}`;
    output.data = pattern;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to record pattern: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
