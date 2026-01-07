#!/usr/bin/env tsx

/**
 * Add a new task
 */

import { parseArgs } from "util";
import type { ScriptOutput, Task, EmbeddingEntry } from "../lib/types";
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
import { getEmbedding, createTaskText } from "../lib/embeddings";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      description: { type: "string", short: "d" },
      priority: { type: "string", short: "p" },
      session: { type: "string", short: "s" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<Task> = {
    success: false,
    message: "",
  };

  const title = positionals.join(" ");
  const description = values.description as string | undefined;
  const priority = values.priority as Task["priority"] | undefined;
  const sessionId = (values.session as string) || "manual";

  if (!title) {
    output.message = 'Usage: add-task.ts "<title>" [-d description] [-p priority]';
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

    const task: Task = {
      id: generateId(),
      title,
      description,
      status: "pending",
      priority,
      sessionCreated: sessionId,
      timestampCreated: new Date().toISOString(),
    };

    // Generate embedding
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const text = createTaskText(task);
    const embedding = await getEmbedding(text, config.embeddingModel);

    const entry: EmbeddingEntry = {
      id: task.id,
      type: "task",
      text,
      sessionId,
    };

    await vectorStore.insert(entry, embedding);
    vectorStore.close();

    // Update index
    index.tasks.push(task);
    index.totalTasks.pending += 1;

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Task added: ${title}`;
    output.data = task;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to add task: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
