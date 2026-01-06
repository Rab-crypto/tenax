#!/usr/bin/env bun

/**
 * Remove entries from project memory
 * Can delete by ID or type
 */

import { parseArgs } from "util";
import type { ScriptOutput } from "../lib/types";
import { loadIndex, saveIndex, getProjectRoot, isMemoryInitialized, getEmbeddingsDbPath } from "../lib/storage";
import { createVectorStore } from "../lib/vector-store";

interface ForgetOutput {
  deleted: number;
  type: string;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      type: { type: "string", short: "t" },
      all: { type: "boolean", short: "a" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<ForgetOutput> = {
    success: false,
    message: "",
  };

  const id = positionals[0];
  const typeFilter = values.type as string | undefined;
  const deleteAll = values.all as boolean | undefined;

  if (!id && !typeFilter && !deleteAll) {
    output.message = "Usage: forget.ts <id> or --type <type> or --all";
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
    const index = await loadIndex(projectRoot);
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    let deleted = 0;
    let deletedType = "entries";

    if (id) {
      // Delete single entry by ID
      let found = false;

      // Check decisions
      const decisionIdx = index.decisions.findIndex((d) => d.id === id);
      if (decisionIdx !== -1) {
        const decision = index.decisions[decisionIdx]!;
        index.decisions.splice(decisionIdx, 1);
        index.totalDecisions -= 1;
        // Remove from topics
        if (index.topics[decision.topic]) {
          index.topics[decision.topic] = index.topics[decision.topic]!.filter((i) => i !== id);
        }
        found = true;
        deletedType = "decision";
      }

      // Check patterns
      if (!found) {
        const patternIdx = index.patterns.findIndex((p) => p.id === id);
        if (patternIdx !== -1) {
          index.patterns.splice(patternIdx, 1);
          index.totalPatterns -= 1;
          found = true;
          deletedType = "pattern";
        }
      }

      // Check tasks
      if (!found) {
        const taskIdx = index.tasks.findIndex((t) => t.id === id);
        if (taskIdx !== -1) {
          const task = index.tasks[taskIdx]!;
          if (task.status === "pending") {
            index.totalTasks.pending -= 1;
          } else if (task.status === "completed") {
            index.totalTasks.completed -= 1;
          }
          index.tasks.splice(taskIdx, 1);
          found = true;
          deletedType = "task";
        }
      }

      // Check insights
      if (!found) {
        const insightIdx = index.insights.findIndex((i) => i.id === id);
        if (insightIdx !== -1) {
          index.insights.splice(insightIdx, 1);
          index.totalInsights -= 1;
          found = true;
          deletedType = "insight";
        }
      }

      if (found) {
        await vectorStore.delete(id);
        deleted = 1;
      } else {
        output.message = `Entry ${id} not found`;
        console.log(JSON.stringify(output, null, 2));
        process.exit(1);
      }
    } else if (deleteAll) {
      // Delete ALL entries
      deletedType = "all entries";

      // Delete all decisions
      for (const d of index.decisions) {
        await vectorStore.delete(d.id);
      }
      deleted += index.decisions.length;
      index.decisions = [];
      index.totalDecisions = 0;
      index.topics = {};

      // Delete all patterns
      for (const p of index.patterns) {
        await vectorStore.delete(p.id);
      }
      deleted += index.patterns.length;
      index.patterns = [];
      index.totalPatterns = 0;

      // Delete all tasks
      for (const t of index.tasks) {
        await vectorStore.delete(t.id);
      }
      deleted += index.tasks.length;
      index.tasks = [];
      index.totalTasks = { pending: 0, completed: 0 };

      // Delete all insights
      for (const i of index.insights) {
        await vectorStore.delete(i.id);
      }
      deleted += index.insights.length;
      index.insights = [];
      index.totalInsights = 0;

    } else if (typeFilter) {
      // Delete all entries of a type
      deletedType = typeFilter;

      switch (typeFilter) {
        case "decision":
        case "decisions":
          deleted = index.decisions.length;
          for (const d of index.decisions) {
            await vectorStore.delete(d.id);
          }
          index.decisions = [];
          index.totalDecisions = 0;
          index.topics = {};
          break;

        case "pattern":
        case "patterns":
          deleted = index.patterns.length;
          for (const p of index.patterns) {
            await vectorStore.delete(p.id);
          }
          index.patterns = [];
          index.totalPatterns = 0;
          break;

        case "task":
        case "tasks":
          deleted = index.tasks.length;
          for (const t of index.tasks) {
            await vectorStore.delete(t.id);
          }
          index.tasks = [];
          index.totalTasks = { pending: 0, completed: 0 };
          break;

        case "insight":
        case "insights":
          deleted = index.insights.length;
          for (const i of index.insights) {
            await vectorStore.delete(i.id);
          }
          index.insights = [];
          index.totalInsights = 0;
          break;

        default:
          output.message = `Unknown type: ${typeFilter}`;
          console.log(JSON.stringify(output, null, 2));
          process.exit(1);
      }
    }

    vectorStore.close();
    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Deleted ${deleted} ${deletedType}`;
    output.data = { deleted, type: deletedType };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to delete: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
