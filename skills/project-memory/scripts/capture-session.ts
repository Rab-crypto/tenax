#!/usr/bin/env bun

/**
 * Capture and process session on SessionEnd hook
 * Reads transcript, extracts knowledge, generates embeddings, and stores data
 */

import type { HookInput, ProcessedSession, FileChange, EmbeddingEntry } from "../lib/types";
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
  clearTempFileChanges,
  getEmbeddingsDbPath,
  loadConfig,
  pruneOldSessions,
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

async function main(): Promise<void> {
  try {
    // Read hook input from stdin or file argument
    let stdin: string;

    // Check if input file is provided as argument
    const inputArg = Bun.argv[2];
    if (inputArg && inputArg.endsWith(".json")) {
      const file = Bun.file(inputArg);
      if (await file.exists()) {
        stdin = await file.text();
      } else {
        console.error(`Input file not found: ${inputArg}`);
        process.exit(0);
      }
    } else {
      // Read from stdin (for real hook usage)
      stdin = await Bun.stdin.text();
    }

    if (!stdin.trim()) {
      console.error("No input received from hook");
      process.exit(0);
    }

    const input: HookInput = JSON.parse(stdin);

    // Only process SessionEnd and PreCompact events
    const validEvents = ["SessionEnd", "PreCompact"];
    if (!validEvents.includes(input.hook_event_name)) {
      console.error(`Ignoring event: ${input.hook_event_name}`);
      process.exit(0);
    }

    const isPreCompact = input.hook_event_name === "PreCompact";

    const projectRoot = input.cwd;
    const transcriptPath = input.transcript_path;

    if (!transcriptPath) {
      console.error("No transcript path provided");
      process.exit(0);
    }

    // Initialize memory if needed
    if (!(await isMemoryInitialized(projectRoot))) {
      await initializeMemoryDirectory(projectRoot);
    }

    // Load index and config
    const index = await loadIndex(projectRoot);
    const config = await loadConfig(projectRoot);

    // Check if we've already captured this Claude session (e.g., from PreCompact)
    const existingSession = findSessionByClaudeId(index, input.session_id);
    const isUpdate = existingSession !== undefined;
    const sessionId = isUpdate ? existingSession.id : generateSessionId(index);

    console.error(`${isUpdate ? "Updating" : "Processing"} session ${sessionId}${isPreCompact ? " (pre-compact snapshot)" : ""}...`);

    // Copy raw transcript
    await copyTranscript(transcriptPath, sessionId, projectRoot);

    // Parse transcript
    const transcript = await parseTranscript(transcriptPath);

    if (transcript.entries.length === 0) {
      console.error("Empty transcript, skipping");
      process.exit(0);
    }

    // Extract knowledge (async for embedding-based scoring)
    const knowledge = await extractAllKnowledge(transcript, sessionId);

    // Get file changes from temp file (captured by track-file hook)
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
      const existingSession = await import("../lib/storage").then((m) =>
        m.loadSession(sessionId, projectRoot)
      );

      if (existingSession) {
        // Merge decisions: new decisions override existing ones with same topic
        const decisionsByTopic = new Map<string, typeof knowledge.decisions[0]>();
        for (const d of existingSession.decisions) {
          decisionsByTopic.set(d.topic, d);
        }
        // New decisions override existing (they're more recent)
        for (const d of knowledge.decisions) {
          decisionsByTopic.set(d.topic, d);
        }
        mergedDecisions = Array.from(decisionsByTopic.values());

        // Merge patterns: new patterns override existing ones with same name
        const patternsByName = new Map<string, typeof knowledge.patterns[0]>();
        for (const p of existingSession.patterns) {
          patternsByName.set(p.name, p);
        }
        for (const p of knowledge.patterns) {
          patternsByName.set(p.name, p);
        }
        mergedPatterns = Array.from(patternsByName.values());

        // Merge tasks: dedupe by title, keep newer status
        const tasksByTitle = new Map<string, typeof knowledge.tasks[0]>();
        for (const t of existingSession.tasks) {
          tasksByTitle.set(t.title, t);
        }
        for (const t of knowledge.tasks) {
          tasksByTitle.set(t.title, t);
        }
        mergedTasks = Array.from(tasksByTitle.values());

        // Merge insights: dedupe by content
        const insightsByContent = new Map<string, typeof knowledge.insights[0]>();
        for (const i of existingSession.insights) {
          insightsByContent.set(i.content.toLowerCase().trim(), i);
        }
        for (const i of knowledge.insights) {
          insightsByContent.set(i.content.toLowerCase().trim(), i);
        }
        mergedInsights = Array.from(insightsByContent.values());

        // Merge file changes: dedupe by path, keep latest
        const changesByPath = new Map<string, FileChange>();
        for (const c of existingSession.fileChanges) {
          changesByPath.set(c.path, c);
        }
        for (const c of fileChanges) {
          changesByPath.set(c.path, c);
        }
        mergedFileChanges = Array.from(changesByPath.values());

        // Merge key topics
        mergedKeyTopics = [...new Set([...existingSession.keyTopics, ...knowledge.keyTopics])];

        console.error(`  Merged with existing: ${mergedDecisions.length} decisions, ${mergedPatterns.length} patterns, ${mergedTasks.length} tasks, ${mergedInsights.length} insights`);
      }
    }

    // Create processed session with merged data
    const session: ProcessedSession = {
      metadata: {
        id: sessionId,
        claudeSessionId: input.session_id,
        startTime: new Date().toISOString(), // Would be better to get from transcript
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

    // If updating, remove old entries from index and vector store (we'll add the merged data)
    if (isUpdate) {
      // Remove old entries for this session from index
      const oldDecisionIds = index.decisions.filter((d) => d.sessionId === sessionId).map((d) => d.id);
      const oldPatternIds = index.patterns.filter((p) => p.sessionId === sessionId).map((p) => p.id);
      const oldTaskIds = index.tasks.filter((t) => t.sessionCreated === sessionId).map((t) => t.id);
      const oldInsightIds = index.insights.filter((i) => i.sessionId === sessionId).map((i) => i.id);

      index.decisions = index.decisions.filter((d) => d.sessionId !== sessionId);
      index.patterns = index.patterns.filter((p) => p.sessionId !== sessionId);
      index.tasks = index.tasks.filter((t) => t.sessionCreated !== sessionId);
      index.insights = index.insights.filter((i) => i.sessionId !== sessionId);

      // Delete old embeddings from vector store
      const allOldIds = [...oldDecisionIds, ...oldPatternIds, ...oldTaskIds, ...oldInsightIds, `session-${sessionId}`];
      for (const id of allOldIds) {
        vectorStore.delete(id);
      }

      console.error(`  Cleared ${allOldIds.length} old entries for session ${sessionId}`);
    }

    // Use merged data for embeddings (not the raw extraction)
    const dataForEmbeddings = {
      decisions: mergedDecisions,
      patterns: mergedPatterns,
      tasks: mergedTasks,
      insights: mergedInsights,
    };

    const embeddingEntries: Array<{ entry: EmbeddingEntry; text: string }> = [];

    // Add decisions (from merged data)
    for (const decision of dataForEmbeddings.decisions) {
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
    for (const pattern of dataForEmbeddings.patterns) {
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
    for (const task of dataForEmbeddings.tasks) {
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
    for (const insight of dataForEmbeddings.insights) {
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
      console.error(`Generating embeddings for ${embeddingEntries.length} entries...`);

      const texts = embeddingEntries.map((e) => e.text);
      const embeddings = await getEmbeddings(texts, config.embeddingModel);

      // Store in vector database
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
      // Update session metadata
      const sessionIdx = index.sessions.findIndex((s) => s.id === sessionId);
      if (sessionIdx !== -1) {
        index.sessions[sessionIdx] = session.metadata;
      }
    } else {
      // New session
      index.totalSessions += 1;
      index.sessions.push(session.metadata);
    }

    // Add all merged knowledge to index (old entries were cleared above for updates)
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

    // Rebuild topics index for this session's decisions
    for (const decision of mergedDecisions) {
      if (!index.topics[decision.topic]) {
        index.topics[decision.topic] = [];
      }
      // Avoid duplicates
      if (!index.topics[decision.topic]!.includes(decision.id)) {
        index.topics[decision.topic]!.push(decision.id);
      }
    }

    // Save updated index
    await saveIndex(index, projectRoot);

    // Prune old sessions if limit exceeded
    const pruneResult = await pruneOldSessions(config, index, projectRoot);
    if (pruneResult.pruned > 0) {
      // Save index again after pruning
      await saveIndex(index, projectRoot);
      console.error(`  Pruned ${pruneResult.pruned} old sessions (keeping ${pruneResult.remaining})`);
    }

    // Clear temp file changes
    await clearTempFileChanges(projectRoot);

    console.error(`Session ${sessionId} captured successfully`);
    console.error(`  - ${mergedDecisions.length} decisions`);
    console.error(`  - ${mergedPatterns.length} patterns`);
    console.error(`  - ${mergedTasks.length} tasks`);
    console.error(`  - ${mergedInsights.length} insights`);
    console.error(`  - ${mergedFileChanges.length} file changes`);

    process.exit(0);
  } catch (error) {
    console.error("Error capturing session:", error);
    process.exit(0); // Don't fail the hook
  }
}

// Run main - errors are handled internally, but catch any uncaught promise rejections
main();
