#!/usr/bin/env bun

/**
 * Record a new decision
 * Args: topic, decision, rationale
 */

import { parseArgs } from "util";
import type { ScriptOutput, Decision, EmbeddingEntry } from "../lib/types";
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
import { getEmbedding, createDecisionText } from "../lib/embeddings";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      topic: { type: "string", short: "t" },
      rationale: { type: "string", short: "r" },
      session: { type: "string", short: "s" },
      supersedes: { type: "string" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<Decision> = {
    success: false,
    message: "",
  };

  // Get decision text from positionals or named args
  const decisionText = positionals.join(" ");
  const topic = values.topic as string | undefined;
  const rationale = values.rationale as string | undefined;
  const sessionId = (values.session as string) || "manual";
  const supersedes = values.supersedes as string | undefined;

  if (!decisionText || !topic) {
    output.message = 'Usage: record-decision.ts -t <topic> -r <rationale> "<decision>"';
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  // Initialize if needed
  if (!(await isMemoryInitialized(projectRoot))) {
    await initializeMemoryDirectory(projectRoot);
  }

  try {
    const config = await loadConfig(projectRoot);
    const index = await loadIndex(projectRoot);

    // Create decision
    const decision: Decision = {
      id: generateId(),
      topic,
      decision: decisionText,
      rationale: rationale || "",
      sessionId,
      timestamp: new Date().toISOString(),
      supersedes,
    };

    // Generate embedding
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const text = createDecisionText(decision);
    const embedding = await getEmbedding(text, config.embeddingModel);

    const entry: EmbeddingEntry = {
      id: decision.id,
      type: "decision",
      text,
      sessionId,
    };

    await vectorStore.insert(entry, embedding);
    vectorStore.close();

    // Update index
    index.decisions.push(decision);
    index.totalDecisions += 1;

    // Update topics
    if (!index.topics[topic]) {
      index.topics[topic] = [];
    }
    index.topics[topic].push(decision.id);

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Decision recorded: ${topic}`;
    output.data = decision;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to record decision: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
