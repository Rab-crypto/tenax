#!/usr/bin/env bun

/**
 * Mark a task as completed
 */

import { parseArgs } from "util";
import type { ScriptOutput, Task, EmbeddingEntry } from "../lib/types";
import { loadIndex, saveIndex, getProjectRoot, isMemoryInitialized, loadConfig, getEmbeddingsDbPath } from "../lib/storage";
import { createVectorStore } from "../lib/vector-store";
import { getEmbedding, createTaskText } from "../lib/embeddings";

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      session: { type: "string", short: "s" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<Task> = {
    success: false,
    message: "",
  };

  const taskId = positionals[0];
  const sessionId = values.session as string | undefined;

  if (!taskId) {
    output.message = "Usage: complete-task.ts <task-id>";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const config = await loadConfig(projectRoot);
    const index = await loadIndex(projectRoot);

    const taskIndex = index.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      output.message = `Task ${taskId} not found`;
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }

    const task = index.tasks[taskIndex]!;
    const previousStatus = task.status;

    task.status = "completed";
    task.timestampCompleted = new Date().toISOString();
    if (sessionId) {
      task.sessionCompleted = sessionId;
    }

    // Update counts
    if (previousStatus === "pending") {
      index.totalTasks.pending -= 1;
    }
    index.totalTasks.completed += 1;

    // Update embedding with new task status
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const text = createTaskText(task);
    const embedding = await getEmbedding(text, config.embeddingModel);

    const entry: EmbeddingEntry = {
      id: task.id,
      type: "task",
      text,
      sessionId: task.sessionCreated,
    };

    await vectorStore.insert(entry, embedding);
    vectorStore.close();

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Task completed: ${task.title}`;
    output.data = task;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
