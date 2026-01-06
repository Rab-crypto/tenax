#!/usr/bin/env bun

/**
 * Clear old extracted data and re-extract all sessions with new extraction logic
 */

import { join } from "node:path";
import { readdir, unlink, writeFile } from "node:fs/promises";
import { DEFAULT_INDEX } from "../skills/project-memory/lib/types";
import { parseTranscript } from "../skills/project-memory/lib/transcript-parser";
import { extractAllKnowledge } from "../skills/project-memory/lib/extractor";
import {
  saveSession,
  saveIndex,
  getMemoryPath,
  getSessionsPath,
  getIndexPath,
  getEmbeddingsDbPath,
  generateSessionId,
} from "../skills/project-memory/lib/storage";
import { createVectorStore } from "../skills/project-memory/lib/vector-store";
import {
  getEmbedding,
  createDecisionText,
  createPatternText,
  createTaskText,
  createInsightText,
  createSessionText,
} from "../skills/project-memory/lib/embeddings";
import type { ProcessedSession, EmbeddingEntry, ProjectIndex } from "../skills/project-memory/lib/types";

const projectRoot = process.cwd();

async function main() {
  console.log("=== Re-extracting all sessions with new extraction logic ===\n");

  const memoryPath = getMemoryPath(projectRoot);
  const sessionsPath = getSessionsPath(projectRoot);
  const indexPath = getIndexPath(projectRoot);
  const embeddingsPath = getEmbeddingsDbPath(projectRoot);

  // Step 1: Find all JSONL transcript files
  console.log("Step 1: Finding transcript files...");
  const files = await readdir(sessionsPath);
  const jsonlFiles = files.filter(f => f.endsWith(".jsonl")).sort();
  console.log(`  Found ${jsonlFiles.length} transcript files\n`);

  if (jsonlFiles.length === 0) {
    console.log("No transcripts to process.");
    return;
  }

  // Step 2: Delete old JSON session files
  console.log("Step 2: Deleting old session JSON files...");
  const jsonFiles = files.filter(f => f.endsWith(".json"));
  for (const file of jsonFiles) {
    await unlink(join(sessionsPath, file));
    console.log(`  Deleted ${file}`);
  }
  console.log();

  // Step 3: Reset index
  console.log("Step 3: Resetting index...");
  const newIndex: ProjectIndex = {
    ...DEFAULT_INDEX,
    projectPath: projectRoot,
    lastUpdated: new Date().toISOString(),
  };
  await writeFile(indexPath, JSON.stringify(newIndex, null, 2));
  console.log("  Index reset to defaults\n");

  // Step 4: Delete embeddings database
  console.log("Step 4: Clearing embeddings database...");
  try {
    await unlink(embeddingsPath);
    console.log("  Embeddings database deleted\n");
  } catch {
    console.log("  No existing embeddings database\n");
  }

  // Step 5: Re-extract each session
  console.log("Step 5: Re-extracting sessions...\n");

  const vectorStore = createVectorStore(embeddingsPath);
  let sessionNum = 0;

  for (const jsonlFile of jsonlFiles) {
    const sessionId = jsonlFile.replace(".jsonl", "");
    const transcriptPath = join(sessionsPath, jsonlFile);

    console.log(`Processing session ${sessionId}...`);

    // Parse transcript
    const transcript = await parseTranscript(transcriptPath);
    if (transcript.entries.length === 0) {
      console.log(`  Skipping ${sessionId} - empty transcript`);
      continue;
    }

    // Extract knowledge with new logic
    const knowledge = await extractAllKnowledge(transcript, sessionId);

    // Create processed session
    const session: ProcessedSession = {
      metadata: {
        id: sessionId,
        claudeSessionId: `reextracted-${sessionId}`,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        tokenCount: Math.ceil(transcript.fullText.length / 4),
        summary: knowledge.summary,
        decisionsCount: knowledge.decisions.length,
        tasksCount: knowledge.tasks.length,
        patternsCount: knowledge.patterns.length,
        insightsCount: knowledge.insights.length,
        filesModified: 0,
      },
      decisions: knowledge.decisions,
      patterns: knowledge.patterns,
      tasks: knowledge.tasks,
      insights: knowledge.insights,
      fileChanges: [],
      keyTopics: knowledge.keyTopics,
    };

    // Save session
    await saveSession(session, projectRoot);

    // Generate and store embeddings
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

    // Add session summary
    embeddingEntries.push({
      entry: { id: `session-${sessionId}`, type: "session", text: createSessionText(session.metadata), sessionId },
      text: createSessionText({ summary: session.metadata.summary, keyTopics: knowledge.keyTopics }),
    });

    // Generate embeddings and store
    if (embeddingEntries.length > 0) {
      const batch: Array<{ entry: EmbeddingEntry; embedding: Float32Array }> = [];
      for (const e of embeddingEntries) {
        const embedding = await getEmbedding(e.text);
        batch.push({ entry: e.entry, embedding });
      }
      await vectorStore.insertBatch(batch);
    }

    // Update index
    newIndex.totalSessions += 1;
    newIndex.totalDecisions += knowledge.decisions.length;
    newIndex.totalPatterns += knowledge.patterns.length;
    newIndex.totalInsights += knowledge.insights.length;
    newIndex.totalTasks.pending += knowledge.tasks.filter(t => t.status === "pending").length;

    newIndex.sessions.push(session.metadata);
    newIndex.decisions.push(...knowledge.decisions);
    newIndex.patterns.push(...knowledge.patterns);
    newIndex.tasks.push(...knowledge.tasks);
    newIndex.insights.push(...knowledge.insights);

    for (const decision of knowledge.decisions) {
      if (!newIndex.topics[decision.topic]) {
        newIndex.topics[decision.topic] = [];
      }
      newIndex.topics[decision.topic]!.push(decision.id);
    }

    console.log(`  - ${knowledge.decisions.length} decisions`);
    console.log(`  - ${knowledge.patterns.length} patterns`);
    console.log(`  - ${knowledge.tasks.length} tasks`);
    console.log(`  - ${knowledge.insights.length} insights`);
    console.log();

    sessionNum++;
  }

  // Save final index
  newIndex.lastUpdated = new Date().toISOString();
  await saveIndex(newIndex, projectRoot);
  vectorStore.close();

  console.log("=== Re-extraction Complete ===");
  console.log(`Processed ${sessionNum} sessions`);
  console.log(`Total decisions: ${newIndex.totalDecisions}`);
  console.log(`Total patterns: ${newIndex.totalPatterns}`);
  console.log(`Total tasks: ${newIndex.totalTasks.pending}`);
  console.log(`Total insights: ${newIndex.totalInsights}`);
}

main().catch(console.error);
