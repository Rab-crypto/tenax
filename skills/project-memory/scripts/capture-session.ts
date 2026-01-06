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

    // Create processed session
    const session: ProcessedSession = {
      metadata: {
        id: sessionId,
        claudeSessionId: input.session_id,
        startTime: new Date().toISOString(), // Would be better to get from transcript
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

    // If updating, filter out knowledge we already have (deduplicate)
    if (isUpdate) {
      // Get existing entries for this session
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

      // Filter to only new knowledge
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

      console.error(`  Deduplicated: ${knowledge.decisions.length} new decisions, ${knowledge.patterns.length} new patterns, ${knowledge.tasks.length} new tasks, ${knowledge.insights.length} new insights`);
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

    // Update index
    if (isUpdate) {
      // Update session metadata with latest info
      const sessionIdx = index.sessions.findIndex((s) => s.id === sessionId);
      if (sessionIdx !== -1) {
        // Merge counts - keep existing + add new
        const existing = index.sessions[sessionIdx]!;
        session.metadata.decisionsCount = existing.decisionsCount + knowledge.decisions.length;
        session.metadata.patternsCount = existing.patternsCount + knowledge.patterns.length;
        session.metadata.tasksCount = existing.tasksCount + knowledge.tasks.length;
        session.metadata.insightsCount = existing.insightsCount + knowledge.insights.length;
        index.sessions[sessionIdx] = session.metadata;
      }
    } else {
      // New session
      index.totalSessions += 1;
      index.sessions.push(session.metadata);
    }

    // Append new knowledge (deduplicated above if updating)
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
    console.error(`  - ${knowledge.decisions.length} decisions`);
    console.error(`  - ${knowledge.patterns.length} patterns`);
    console.error(`  - ${knowledge.tasks.length} tasks`);
    console.error(`  - ${knowledge.insights.length} insights`);
    console.error(`  - ${fileChanges.length} file changes`);

    process.exit(0);
  } catch (error) {
    console.error("Error capturing session:", error);
    process.exit(0); // Don't fail the hook
  }
}

// Run main - errors are handled internally, but catch any uncaught promise rejections
main();
