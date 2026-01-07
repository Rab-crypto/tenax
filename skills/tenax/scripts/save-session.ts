#!/usr/bin/env tsx

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
    args: process.argv.slice(2),
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
    const knowledge = await extractAllKnowledge(transcript, sessionId);

    // Get file changes from temp file
    const tempFileChanges = await loadTempFileChanges(projectRoot);
    const fileChanges: FileChange[] = tempFileChanges.map((c) => ({
      path: c.path,
      action: c.action === "created" ? "created" : "modified",
      timestamp: c.timestamp,
    }));

    // If updating, merge with existing session data (keep latest for same-topic decisions)
    let mergedDecisions = knowledge.decisions;
    let mergedPatterns = knowledge.patterns;
    let mergedTasks = knowledge.tasks;
    let mergedInsights = knowledge.insights;
    let mergedFileChanges = fileChanges;
    let mergedKeyTopics = knowledge.keyTopics;

    if (isUpdate) {
      const { loadSession } = await import("../lib/storage");
      const existingSessionData = await loadSession(sessionId, projectRoot);

      if (existingSessionData) {
        // Merge decisions: new decisions override existing ones with same topic
        const decisionsByTopic = new Map<string, typeof knowledge.decisions[0]>();
        for (const d of existingSessionData.decisions) {
          decisionsByTopic.set(d.topic, d);
        }
        for (const d of knowledge.decisions) {
          decisionsByTopic.set(d.topic, d);
        }
        mergedDecisions = Array.from(decisionsByTopic.values());

        // Merge patterns: new patterns override existing ones with same name
        const patternsByName = new Map<string, typeof knowledge.patterns[0]>();
        for (const p of existingSessionData.patterns) {
          patternsByName.set(p.name, p);
        }
        for (const p of knowledge.patterns) {
          patternsByName.set(p.name, p);
        }
        mergedPatterns = Array.from(patternsByName.values());

        // Merge tasks: dedupe by title, keep newer status
        const tasksByTitle = new Map<string, typeof knowledge.tasks[0]>();
        for (const t of existingSessionData.tasks) {
          tasksByTitle.set(t.title, t);
        }
        for (const t of knowledge.tasks) {
          tasksByTitle.set(t.title, t);
        }
        mergedTasks = Array.from(tasksByTitle.values());

        // Merge insights: dedupe by content
        const insightsByContent = new Map<string, typeof knowledge.insights[0]>();
        for (const i of existingSessionData.insights) {
          insightsByContent.set(i.content.toLowerCase().trim(), i);
        }
        for (const i of knowledge.insights) {
          insightsByContent.set(i.content.toLowerCase().trim(), i);
        }
        mergedInsights = Array.from(insightsByContent.values());

        // Merge file changes
        const changesByPath = new Map<string, FileChange>();
        for (const c of existingSessionData.fileChanges) {
          changesByPath.set(c.path, c);
        }
        for (const c of fileChanges) {
          changesByPath.set(c.path, c);
        }
        mergedFileChanges = Array.from(changesByPath.values());

        // Merge key topics
        mergedKeyTopics = [...new Set([...existingSessionData.keyTopics, ...knowledge.keyTopics])];

        console.error(`  Merged with existing: ${mergedDecisions.length} decisions, ${mergedPatterns.length} patterns`);
      }
    }

    // Create processed session with merged data
    const session: ProcessedSession = {
      metadata: {
        id: sessionId,
        claudeSessionId: claudeSessionId || `manual-${Date.now()}`,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        tokenCount: countTranscriptTokens(transcript),
        summary: knowledge.summary,
        decisionsCount: mergedDecisions.length,
        tasksCount: mergedTasks.length,
        patternsCount: mergedPatterns.length,
        insightsCount: mergedInsights.length,
        filesModified: mergedFileChanges.length,
      },
      decisions: mergedDecisions,
      patterns: mergedPatterns,
      tasks: mergedTasks,
      insights: mergedInsights,
      fileChanges: mergedFileChanges,
      keyTopics: mergedKeyTopics,
    };

    // Save processed session
    await saveSession(session, projectRoot);

    // Generate embeddings and store in vector database
    const vectorStore = createVectorStore(getEmbeddingsDbPath(projectRoot));

    // If updating, clear old entries first
    if (isUpdate) {
      const oldDecisionIds = index.decisions.filter((d) => d.sessionId === sessionId).map((d) => d.id);
      const oldPatternIds = index.patterns.filter((p) => p.sessionId === sessionId).map((p) => p.id);
      const oldTaskIds = index.tasks.filter((t) => t.sessionCreated === sessionId).map((t) => t.id);
      const oldInsightIds = index.insights.filter((i) => i.sessionId === sessionId).map((i) => i.id);

      index.decisions = index.decisions.filter((d) => d.sessionId !== sessionId);
      index.patterns = index.patterns.filter((p) => p.sessionId !== sessionId);
      index.tasks = index.tasks.filter((t) => t.sessionCreated !== sessionId);
      index.insights = index.insights.filter((i) => i.sessionId !== sessionId);

      const allOldIds = [...oldDecisionIds, ...oldPatternIds, ...oldTaskIds, ...oldInsightIds, `session-${sessionId}`];
      for (const id of allOldIds) {
        vectorStore.delete(id);
      }
    }

    const embeddingEntries: Array<{ entry: EmbeddingEntry; text: string }> = [];

    // Add decisions (from merged data)
    for (const decision of mergedDecisions) {
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

    // Add patterns (from merged data)
    for (const pattern of mergedPatterns) {
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

    // Add tasks (from merged data)
    for (const task of mergedTasks) {
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

    // Add insights (from merged data)
    for (const insight of mergedInsights) {
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
      text: createSessionText({ summary: session.metadata.summary, keyTopics: mergedKeyTopics }),
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

    // Update index with merged data
    if (isUpdate) {
      const sessionIdx = index.sessions.findIndex((s) => s.id === sessionId);
      if (sessionIdx !== -1) {
        index.sessions[sessionIdx] = session.metadata;
      }
    } else {
      index.totalSessions += 1;
      index.sessions.push(session.metadata);
    }

    // Add all merged knowledge to index
    index.decisions.push(...mergedDecisions);
    index.patterns.push(...mergedPatterns);
    index.tasks.push(...mergedTasks);
    index.insights.push(...mergedInsights);

    // Recalculate totals
    index.totalDecisions = index.decisions.length;
    index.totalPatterns = index.patterns.length;
    index.totalInsights = index.insights.length;
    index.totalTasks.pending = index.tasks.filter((t) => t.status === "pending").length;
    index.totalTasks.completed = index.tasks.filter((t) => t.status === "completed").length;

    // Update topics index
    for (const decision of mergedDecisions) {
      if (!index.topics[decision.topic]) {
        index.topics[decision.topic] = [];
      }
      if (!index.topics[decision.topic]!.includes(decision.id)) {
        index.topics[decision.topic]!.push(decision.id);
      }
    }

    await saveIndex(index, projectRoot);

    output.success = true;
    output.message = `Session ${sessionId} ${isUpdate ? "updated" : "saved"}: ${mergedDecisions.length} decisions, ${mergedPatterns.length} patterns`;
    output.data = {
      sessionId,
      decisions: mergedDecisions.length,
      patterns: mergedPatterns.length,
      tasks: mergedTasks.length,
      insights: mergedInsights.length,
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
