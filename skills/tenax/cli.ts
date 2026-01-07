#!/usr/bin/env tsx

/**
 * Unified CLI for tenax plugin
 * Single entry point for all commands - reduces permission prompts to one pattern
 *
 * Usage:
 *   tsx cli.ts <command> [args...]
 *   tsx cli.ts batch --json '<batch-data>'
 */

import { parseArgs } from "util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, "scripts");

const commands = [
  "record-decision",
  "record-pattern",
  "add-task",
  "add-insight",
  "complete-task",
  "search",
  "get-summary",
  "get-session",
  "get-sessions",
  "list-sessions",
  "init",
  "forget",
  "export",
  "backup",
  "restore",
  "stats",
  "tag-session",
  "track-file",
  "capture-session",
  "save-session",
  "save-conversation",
];

interface BatchInput {
  decisions?: Array<{ topic: string; decision: string; rationale?: string }>;
  patterns?: Array<{ name: string; description: string; usage?: string }>;
  tasks?: Array<{ title: string; description?: string; priority?: string }>;
  insights?: Array<{ content: string; context?: string }>;
}

async function runBatch(jsonInput: string): Promise<void> {
  const {
    loadIndex,
    saveIndex,
    loadConfig,
    getProjectRoot,
    isMemoryInitialized,
    initializeMemoryDirectory,
    generateId,
    getEmbeddingsDbPath,
  } = await import("./lib/storage");
  const { createVectorStore } = await import("./lib/vector-store");
  const {
    getEmbeddings,
    createDecisionText,
    createPatternText,
    createTaskText,
    createInsightText,
  } = await import("./lib/embeddings");
  type Decision = import("./lib/types").Decision;
  type Pattern = import("./lib/types").Pattern;
  type Task = import("./lib/types").Task;
  type Insight = import("./lib/types").Insight;
  type EmbeddingEntry = import("./lib/types").EmbeddingEntry;

  let batch: BatchInput;
  try {
    batch = JSON.parse(jsonInput);
  } catch {
    console.log(JSON.stringify({ success: false, message: "Invalid JSON input" }));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    await initializeMemoryDirectory(projectRoot);
  }

  const config = await loadConfig(projectRoot);
  const index = await loadIndex(projectRoot);
  const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));

  const results = {
    decisions: 0,
    patterns: 0,
    tasks: 0,
    insights: 0,
  };

  const embeddingEntries: Array<{ entry: EmbeddingEntry; text: string }> = [];

  // Process decisions
  if (batch.decisions) {
    for (const d of batch.decisions) {
      const decision: Decision = {
        id: generateId(),
        topic: d.topic,
        decision: d.decision,
        rationale: d.rationale || "",
        sessionId: "manual",
        timestamp: new Date().toISOString(),
      };

      // Check for duplicates
      const exists = index.decisions.some(
        (existing) =>
          existing.topic === decision.topic &&
          existing.decision.toLowerCase() === decision.decision.toLowerCase()
      );

      if (!exists) {
        index.decisions.push(decision);
        index.totalDecisions += 1;

        if (!index.topics[decision.topic]) {
          index.topics[decision.topic] = [];
        }
        index.topics[decision.topic]!.push(decision.id);

        embeddingEntries.push({
          entry: {
            id: decision.id,
            type: "decision",
            text: createDecisionText(decision),
            sessionId: "manual",
          },
          text: createDecisionText(decision),
        });

        results.decisions++;
      }
    }
  }

  // Process patterns
  if (batch.patterns) {
    for (const p of batch.patterns) {
      const pattern: Pattern = {
        id: generateId(),
        name: p.name,
        description: p.description,
        usage: p.usage || "",
        sessionId: "manual",
        timestamp: new Date().toISOString(),
      };

      const exists = index.patterns.some(
        (existing) =>
          existing.name.toLowerCase() === pattern.name.toLowerCase()
      );

      if (!exists) {
        index.patterns.push(pattern);
        index.totalPatterns += 1;

        embeddingEntries.push({
          entry: {
            id: pattern.id,
            type: "pattern",
            text: createPatternText(pattern),
            sessionId: "manual",
          },
          text: createPatternText(pattern),
        });

        results.patterns++;
      }
    }
  }

  // Process tasks
  if (batch.tasks) {
    for (const t of batch.tasks) {
      const task: Task = {
        id: generateId(),
        title: t.title,
        description: t.description || "",
        status: "pending",
        priority: (t.priority as Task["priority"]) || "medium",
        sessionCreated: "manual",
        timestampCreated: new Date().toISOString(),
      };

      const exists = index.tasks.some(
        (existing) => existing.title.toLowerCase() === task.title.toLowerCase()
      );

      if (!exists) {
        index.tasks.push(task);
        index.totalTasks.pending += 1;

        embeddingEntries.push({
          entry: {
            id: task.id,
            type: "task",
            text: createTaskText(task),
            sessionId: "manual",
          },
          text: createTaskText(task),
        });

        results.tasks++;
      }
    }
  }

  // Process insights
  if (batch.insights) {
    for (const i of batch.insights) {
      const insight: Insight = {
        id: generateId(),
        content: i.content,
        context: i.context || "",
        sessionId: "manual",
        timestamp: new Date().toISOString(),
      };

      const exists = index.insights.some(
        (existing) => existing.content.toLowerCase() === insight.content.toLowerCase()
      );

      if (!exists) {
        index.insights.push(insight);
        index.totalInsights += 1;

        embeddingEntries.push({
          entry: {
            id: insight.id,
            type: "insight",
            text: createInsightText(insight),
            sessionId: "manual",
          },
          text: createInsightText(insight),
        });

        results.insights++;
      }
    }
  }

  // Generate embeddings in batch
  if (embeddingEntries.length > 0) {
    const texts = embeddingEntries.map((e) => e.text);
    const embeddings = await getEmbeddings(texts, config.embeddingModel);

    const batchData = embeddingEntries
      .map((e, i) => ({
        entry: e.entry,
        embedding: embeddings[i],
      }))
      .filter((b): b is { entry: typeof b.entry; embedding: Float32Array } =>
        b.embedding !== undefined
      );

    await vectorStore.insertBatch(batchData);
  }

  vectorStore.close();
  await saveIndex(index, projectRoot);

  console.log(
    JSON.stringify({
      success: true,
      message: `Batch saved: ${results.decisions} decisions, ${results.patterns} patterns, ${results.tasks} tasks, ${results.insights} insights`,
      data: results,
    })
  );
}

async function runCommand(command: string, args: string[]): Promise<void> {
  const scriptPath = join(SCRIPTS_DIR, `${command}.ts`);
  const fs = await import("fs");
  const path = await import("path");

  // Try to use local tsx first
  const isWindows = process.platform === "win32";
  const pluginRoot = join(__dirname, "..", "..");
  const localTsx = join(pluginRoot, "node_modules", ".bin", isWindows ? "tsx.cmd" : "tsx");

  let proc;
  if (fs.existsSync(localTsx)) {
    proc = spawn(localTsx, [scriptPath, ...args], {
      stdio: "inherit",
      shell: isWindows,
    });
  } else {
    // Fall back to npx
    proc = spawn(isWindows ? "npx.cmd" : "npx", ["tsx", scriptPath, ...args], {
      stdio: "inherit",
      shell: isWindows,
    });
  }

  proc.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(
      JSON.stringify({
        success: false,
        message: "Usage: cli.ts <command> [args...] or cli.ts batch --json '<data>'",
        commands: commands,
      })
    );
    process.exit(1);
  }

  const command = args[0]!;

  // Handle batch command specially - runs in-process for efficiency
  if (command === "batch") {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        json: { type: "string", short: "j" },
        "json-file": { type: "string", short: "f" },
      },
      strict: false,
      allowPositionals: true,
    });

    let jsonInput = values.json as string | undefined;
    const jsonFile = values["json-file"] as string | undefined;

    // Priority: --json-file > --json > stdin
    if (jsonFile) {
      try {
        const fs = await import("fs");
        jsonInput = fs.readFileSync(jsonFile, "utf-8");
      } catch (e) {
        console.log(
          JSON.stringify({
            success: false,
            message: `Could not read file: ${jsonFile}`,
          })
        );
        process.exit(1);
      }
    } else if (!jsonInput) {
      // Try reading from stdin (non-blocking check)
      const fs = await import("fs");
      try {
        // Check if stdin has data (non-TTY means piped input)
        if (!process.stdin.isTTY) {
          jsonInput = fs.readFileSync(0, "utf-8");
        }
      } catch {
        // No stdin data
      }
    }

    if (!jsonInput) {
      console.log(
        JSON.stringify({
          success: false,
          message: "Usage: cli.ts batch --json '<data>' OR --json-file <path> OR pipe JSON to stdin",
        })
      );
      process.exit(1);
    }

    await runBatch(jsonInput);
    return;
  }

  // Handle regular commands by spawning the script
  if (commands.includes(command)) {
    await runCommand(command, args.slice(1));
  } else {
    console.log(
      JSON.stringify({
        success: false,
        message: `Unknown command: ${command}`,
        commands: commands,
      })
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("CLI error:", error);
  process.exit(1);
});
