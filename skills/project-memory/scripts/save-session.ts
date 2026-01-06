#!/usr/bin/env bun

/**
 * Manually save/capture the current session
 * This allows saving session state without waiting for PreCompact or SessionEnd
 */

import { parseArgs } from "util";
import type { ScriptOutput, ProcessedSession, FileChange, EmbeddingEntry } from "../lib/types";
import {
  loadIndex,
  saveIndex,
  saveSession,
  copyTranscript,
  generateSessionId,
  findSessionByClaudeId,
  initializeMemoryDirectory,
  isMemoryInitialized,
  loadTempFileChanges,
  getEmbeddingsDbPath,
  loadConfig,
  getProjectRoot,
} from "../lib/storage";
import { parseTranscript, countTranscriptTokens } from "../lib/transcript-parser";
import { extractAllKnowledge } from "../lib/extractor";
import { createVectorStore } from "../lib/vector-store";
import {
  getEmbeddings,
  createDecisionText,
  createPatternText,
  createTaskText,
  createInsightText,
  createSessionText,
} from "../lib/embeddings";

interface SaveOutput {
  sessionId: string;
  decisions: number;
  patterns: number;
  tasks: number;
  insights: number;
  isUpdate: boolean;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      transcript: { type: "string", short: "t" },
      "session-id": { type: "string", short: "s" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<SaveOutput> = {
    success: false,
    message: "",
  };

  const transcriptPath = values.transcript as string | undefined;
  const claudeSessionId = values["session-id"] as string | undefined;

  if (!transcriptPath) {
    output.message = "Usage: save-session.ts --transcript <path> [--session-id <id>]";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  // Initialize memory if needed
  if (!(await isMemoryInitialized(projectRoot))) {
    await initializeMemoryDirectory(projectRoot);
  }

  try {
    // Load index and config
    const index = await loadIndex(projectRoot);
    const config = await loadConfig(projectRoot);

    // Check if we've already captured this Claude session
    const existingSession = claudeSessionId
      ? findSessionByClaudeId(index, claudeSessionId)
      : undefined;
    const isUpdate = existingSession !== undefined;
    const sessionId = isUpdate ? existingSession.id : generateSessionId(index);

    console.error(`${isUpdate ? "Updating" : "Saving"} session ${sessionId}...`);

    // Copy raw transcript
    await copyTranscript(transcriptPath, sessionId, projectRoot);

    // Parse transcript
    const transcript = await parseTranscript(transcriptPath);

    if (transcript.entries.length === 0) {
      output.message = "Empty transcript, nothing to save";
      output.success = true;
      console.log(JSON.stringify(output, null, 2));
      process.exit(0);
    }

    // Extract knowledge (async for embedding-based scoring)
    let knowledge = await extractAllKnowledge(transcript, sessionId);

    // Get file changes from temp file
    const tempFileChanges = await loadTempFileChanges(projectRoot);
    const fileChanges: FileChange[] = tempFileChanges.map((c) => ({
      path: c.path,
      action: c.action === "created" ? "created" : "modified",
      timestamp: c.timestamp,
    }));

    // Create processed session
    const session: ProcessedSession = {
      metadata: {
        id: sessionId,
        claudeSessionId: claudeSessionId || `manual-${Date.now()}`,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        tokenCount: countTranscriptTokens(transcript),
        summary: knowledge.summary,
        decisionsCount: knowledge.decisions.length,
        tasksCount: knowledge.tasks.length,
        patternsCount: knowledge.patterns.length,
        insightsCount: knowledge.insights.length,
        filesModified: fileChanges.length,
      },
      decisions: knowledge.decisions,
      patterns: knowledge.patterns,
      tasks: knowledge.tasks,
      insights: knowledge.insights,
      fileChanges,
      keyTopics: knowledge.keyTopics,
    };

    // Save processed session
    await saveSession(session, projectRoot);

    // Generate embeddings and store in vector database
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));

    // If updating, deduplicate
    if (isUpdate) {
      const existingDecisions = new Set(
        index.decisions.filter((d) => d.sessionId === sessionId).map((d) => `${d.topic}:${d.decision}`)
      );
      const existingPatterns = new Set(
        index.patterns.filter((p) => p.sessionId === sessionId).map((p) => `${p.name}:${p.description}`)
      );
      const existingTasks = new Set(
        index.tasks.filter((t) => t.sessionCreated === sessionId).map((t) => t.title)
      );
      const existingInsights = new Set(
        index.insights.filter((i) => i.sessionId === sessionId).map((i) => i.content)
      );

      knowledge.decisions = knowledge.decisions.filter(
        (d) => !existingDecisions.has(`${d.topic}:${d.decision}`)
      );
      knowledge.patterns = knowledge.patterns.filter(
        (p) => !existingPatterns.has(`${p.name}:${p.description}`)
      );
      knowledge.tasks = knowledge.tasks.filter(
        (t) => !existingTasks.has(t.title)
      );
      knowledge.insights = knowledge.insights.filter(
        (i) => !existingInsights.has(i.content)
      );
    }

    const embeddingEntries: Array<{ entry: EmbeddingEntry; text: string }> = [];

    // Add decisions
    for (const decision of knowledge.decisions) {
      embeddingEntries.push({
        entry: {
          id: decision.id,
          type: "decision",
          text: createDecisionText(decision),
          sessionId,
        },
        text: createDecisionText(decision),
      });
    }

    // Add patterns
    for (const pattern of knowledge.patterns) {
      embeddingEntries.push({
        entry: {
          id: pattern.id,
          type: "pattern",
          text: createPatternText(pattern),
          sessionId,
        },
        text: createPatternText(pattern),
      });
    }

    // Add tasks
    for (const task of knowledge.tasks) {
      embeddingEntries.push({
        entry: {
          id: task.id,
          type: "task",
          text: createTaskText(task),
          sessionId,
        },
        text: createTaskText(task),
      });
    }

    // Add insights
    for (const insight of knowledge.insights) {
      embeddingEntries.push({
        entry: {
          id: insight.id,
          type: "insight",
          text: createInsightText(insight),
          sessionId,
        },
        text: createInsightText(insight),
      });
    }

    // Add session summary
    embeddingEntries.push({
      entry: {
        id: `session-${sessionId}`,
        type: "session",
        text: createSessionText(session.metadata),
        sessionId,
      },
      text: createSessionText({ summary: session.metadata.summary, keyTopics: knowledge.keyTopics }),
    });

    // Generate embeddings in batch
    if (embeddingEntries.length > 0) {
      const texts = embeddingEntries.map((e) => e.text);
      const embeddings = await getEmbeddings(texts, config.embeddingModel);

      const batch = embeddingEntries
        .map((e, i) => ({
          entry: e.entry,
          embedding: embeddings[i],
        }))
        .filter((b): b is { entry: typeof b.entry; embedding: Float32Array } => b.embedding !== undefined);

      await vectorStore.insertBatch(batch);
    }

    vectorStore.close();

    // Update index
    if (isUpdate) {
      const sessionIdx = index.sessions.findIndex((s) => s.id === sessionId);
      if (sessionIdx !== -1) {
        const existing = index.sessions[sessionIdx]!;
        session.metadata.decisionsCount = existing.decisionsCount + knowledge.decisions.length;
        session.metadata.patternsCount = existing.patternsCount + knowledge.patterns.length;
        session.metadata.tasksCount = existing.tasksCount + knowledge.tasks.length;
        session.metadata.insightsCount = existing.insightsCount + knowledge.insights.length;
        index.sessions[sessionIdx] = session.metadata;
      }
    } else {
      index.totalSessions += 1;
      index.sessions.push(session.metadata);
    }

    // Add new knowledge
    index.totalDecisions += knowledge.decisions.length;
    index.totalPatterns += knowledge.patterns.length;
    index.totalInsights += knowledge.insights.length;

    const pendingTasks = knowledge.tasks.filter((t) => t.status === "pending");
    index.totalTasks.pending += pendingTasks.length;

    index.decisions.push(...knowledge.decisions);
    index.patterns.push(...knowledge.patterns);
    index.tasks.push(...knowledge.tasks);
    index.insights.push(...knowledge.insights);

    // Update topics index
    for (const decision of knowledge.decisions) {
      if (!index.topics[decision.topic]) {
        index.topics[decision.topic] = [];
      }
      index.topics[decision.topic]!.push(decision.id);
    }

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Session ${sessionId} ${isUpdate ? "updated" : "saved"}: ${knowledge.decisions.length} decisions, ${knowledge.patterns.length} patterns`;
    output.data = {
      sessionId,
      decisions: knowledge.decisions.length,
      patterns: knowledge.patterns.length,
      tasks: knowledge.tasks.length,
      insights: knowledge.insights.length,
      isUpdate,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to save session: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
