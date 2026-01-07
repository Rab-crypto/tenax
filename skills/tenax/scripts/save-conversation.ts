#!/usr/bin/env bun

/**
 * Save all knowledge from conversation text in one go
 * Takes conversation content as input and extracts decisions, patterns, tasks, insights
 */

import type { ScriptOutput, EmbeddingEntry, Decision, Pattern, Task, Insight } from "../lib/types";
import {
  loadIndex,
  saveIndex,
  generateId,
  initializeMemoryDirectory,
  isMemoryInitialized,
  getEmbeddingsDbPath,
  loadConfig,
  getProjectRoot,
} from "../lib/storage";
import { parseTranscriptText } from "../lib/transcript-parser";
import { extractAllKnowledge } from "../lib/extractor";
import { createVectorStore } from "../lib/vector-store";
import {
  getEmbeddings,
  createDecisionText,
  createPatternText,
  createTaskText,
  createInsightText,
} from "../lib/embeddings";

interface SaveOutput {
  decisions: number;
  patterns: number;
  tasks: number;
  insights: number;
  deduplicated: {
    decisions: number;
    patterns: number;
    tasks: number;
    insights: number;
  };
}

async function main(): Promise<void> {
  const output: ScriptOutput<SaveOutput> = {
    success: false,
    message: "",
  };

  // Read conversation text from stdin or file argument
  let conversationText: string;

  const inputArg = Bun.argv[2];
  if (inputArg && (inputArg.endsWith(".txt") || inputArg.endsWith(".md") || inputArg.endsWith(".jsonl"))) {
    const file = Bun.file(inputArg);
    if (await file.exists()) {
      conversationText = await file.text();
    } else {
      output.message = `Input file not found: ${inputArg}`;
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }
  } else {
    // Read from stdin
    conversationText = await Bun.stdin.text();
  }

  if (!conversationText.trim()) {
    output.message = "No conversation text provided. Usage: save-conversation.ts < conversation.txt";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  // Initialize memory if needed
  if (!(await isMemoryInitialized(projectRoot))) {
    await initializeMemoryDirectory(projectRoot);
  }

  try {
    const index = await loadIndex(projectRoot);
    const config = await loadConfig(projectRoot);
    const sessionId = "manual";

    // Parse as transcript (handles both JSONL and plain text)
    let transcript;
    if (conversationText.trim().startsWith("{")) {
      // Looks like JSONL
      transcript = parseTranscriptText(conversationText);
    } else {
      // Plain text - convert to pseudo-transcript format
      // Assume alternating User:/Assistant: format or just treat as assistant content
      const lines = conversationText.split("\n");
      const userMessages: string[] = [];
      const assistantMessages: string[] = [];

      let currentRole = "assistant";
      let currentContent: string[] = [];

      for (const line of lines) {
        if (line.startsWith("User:") || line.startsWith("Human:")) {
          if (currentContent.length > 0) {
            if (currentRole === "user") {
              userMessages.push(currentContent.join("\n"));
            } else {
              assistantMessages.push(currentContent.join("\n"));
            }
          }
          currentRole = "user";
          currentContent = [line.replace(/^(User|Human):/, "").trim()];
        } else if (line.startsWith("Assistant:") || line.startsWith("Claude:")) {
          if (currentContent.length > 0) {
            if (currentRole === "user") {
              userMessages.push(currentContent.join("\n"));
            } else {
              assistantMessages.push(currentContent.join("\n"));
            }
          }
          currentRole = "assistant";
          currentContent = [line.replace(/^(Assistant|Claude):/, "").trim()];
        } else {
          currentContent.push(line);
        }
      }

      // Add remaining content
      if (currentContent.length > 0) {
        if (currentRole === "user") {
          userMessages.push(currentContent.join("\n"));
        } else {
          assistantMessages.push(currentContent.join("\n"));
        }
      }

      // If no role markers found, treat entire text as assistant content
      if (userMessages.length === 0 && assistantMessages.length === 0) {
        assistantMessages.push(conversationText);
      }

      transcript = {
        entries: [],
        userMessages,
        assistantMessages,
        toolCalls: [],
        fullText: conversationText,
      };
    }

    // Extract knowledge (async for embedding-based scoring)
    const knowledge = await extractAllKnowledge(transcript, sessionId);

    // Deduplicate against existing knowledge
    const existingDecisions = new Set(
      index.decisions.map((d) => `${d.topic}:${d.decision}`.toLowerCase())
    );
    const existingPatterns = new Set(
      index.patterns.map((p) => `${p.name}:${p.description}`.toLowerCase())
    );
    const existingTasks = new Set(
      index.tasks.map((t) => t.title.toLowerCase())
    );
    const existingInsights = new Set(
      index.insights.map((i) => i.content.toLowerCase())
    );

    const originalCounts = {
      decisions: knowledge.decisions.length,
      patterns: knowledge.patterns.length,
      tasks: knowledge.tasks.length,
      insights: knowledge.insights.length,
    };

    knowledge.decisions = knowledge.decisions.filter(
      (d) => !existingDecisions.has(`${d.topic}:${d.decision}`.toLowerCase())
    );
    knowledge.patterns = knowledge.patterns.filter(
      (p) => !existingPatterns.has(`${p.name}:${p.description}`.toLowerCase())
    );
    knowledge.tasks = knowledge.tasks.filter(
      (t) => !existingTasks.has(t.title.toLowerCase())
    );
    knowledge.insights = knowledge.insights.filter(
      (i) => !existingInsights.has(i.content.toLowerCase())
    );

    const deduplicatedCounts = {
      decisions: originalCounts.decisions - knowledge.decisions.length,
      patterns: originalCounts.patterns - knowledge.patterns.length,
      tasks: originalCounts.tasks - knowledge.tasks.length,
      insights: originalCounts.insights - knowledge.insights.length,
    };

    // Generate embeddings and store
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));
    const embeddingEntries: Array<{ entry: EmbeddingEntry; text: string }> = [];

    for (const decision of knowledge.decisions) {
      embeddingEntries.push({
        entry: { id: decision.id, type: "decision", text: createDecisionText(decision), sessionId },
        text: createDecisionText(decision),
      });
    }

    for (const pattern of knowledge.patterns) {
      embeddingEntries.push({
        entry: { id: pattern.id, type: "pattern", text: createPatternText(pattern), sessionId },
        text: createPatternText(pattern),
      });
    }

    for (const task of knowledge.tasks) {
      embeddingEntries.push({
        entry: { id: task.id, type: "task", text: createTaskText(task), sessionId },
        text: createTaskText(task),
      });
    }

    for (const insight of knowledge.insights) {
      embeddingEntries.push({
        entry: { id: insight.id, type: "insight", text: createInsightText(insight), sessionId },
        text: createInsightText(insight),
      });
    }

    if (embeddingEntries.length > 0) {
      const texts = embeddingEntries.map((e) => e.text);
      const embeddings = await getEmbeddings(texts, config.embeddingModel);

      const batch = embeddingEntries
        .map((e, i) => ({ entry: e.entry, embedding: embeddings[i] }))
        .filter((b): b is { entry: typeof b.entry; embedding: Float32Array } => b.embedding !== undefined);

      await vectorStore.insertBatch(batch);
    }

    vectorStore.close();

    // Update index
    index.totalDecisions += knowledge.decisions.length;
    index.totalPatterns += knowledge.patterns.length;
    index.totalInsights += knowledge.insights.length;
    index.totalTasks.pending += knowledge.tasks.filter((t) => t.status === "pending").length;

    index.decisions.push(...knowledge.decisions);
    index.patterns.push(...knowledge.patterns);
    index.tasks.push(...knowledge.tasks);
    index.insights.push(...knowledge.insights);

    for (const decision of knowledge.decisions) {
      if (!index.topics[decision.topic]) {
        index.topics[decision.topic] = [];
      }
      index.topics[decision.topic]!.push(decision.id);
    }

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Saved ${knowledge.decisions.length} decisions, ${knowledge.patterns.length} patterns, ${knowledge.tasks.length} tasks, ${knowledge.insights.length} insights`;
    output.data = {
      decisions: knowledge.decisions.length,
      patterns: knowledge.patterns.length,
      tasks: knowledge.tasks.length,
      insights: knowledge.insights.length,
      deduplicated: deduplicatedCounts,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
