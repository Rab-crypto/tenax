#!/usr/bin/env bun

/**
 * Debug script to test capture-session directly
 */

import { join } from "path";
import { mkdir, rm } from "fs/promises";

const TEST_DIR = join(import.meta.dir, "debug-project");

async function main() {
  // Clean up and create test dir
  await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  await mkdir(join(TEST_DIR, ".claude", "project-memory", "sessions"), { recursive: true });

  // Create test transcript
  const transcript = [
    { type: "user", content: "Let's use TypeScript for this project" },
    { type: "assistant", content: "I've decided to use TypeScript with strict mode enabled. This will help catch errors early." },
    { type: "user", content: "What about the database?" },
    { type: "assistant", content: "I'll go with PostgreSQL. The rationale is that we need ACID compliance." },
  ].map((m, i) => JSON.stringify({ ...m, timestamp: new Date(Date.now() + i * 1000).toISOString() })).join("\n");

  const transcriptPath = join(TEST_DIR, "transcript.jsonl");
  await Bun.write(transcriptPath, transcript);

  console.log("Transcript content:");
  console.log(transcript);
  console.log("\n---\n");

  // Test parsing directly
  const { parseTranscript } = await import("../skills/project-memory/lib/transcript-parser");
  const parsed = await parseTranscript(transcriptPath);

  console.log("Parsed transcript:");
  console.log(`  Entries: ${parsed.entries.length}`);
  console.log(`  User messages: ${parsed.userMessages.length}`);
  console.log(`  Assistant messages: ${parsed.assistantMessages.length}`);
  console.log(`  Full text length: ${parsed.fullText.length}`);

  if (parsed.assistantMessages.length > 0) {
    console.log("\n  Assistant messages:");
    for (const msg of parsed.assistantMessages) {
      console.log(`    - ${msg.substring(0, 80)}...`);
    }
  }

  console.log("\n---\n");

  // Test extraction directly
  const { extractAllKnowledge } = await import("../skills/project-memory/lib/extractor");
  const knowledge = extractAllKnowledge(parsed, "test-001");

  console.log("Extracted knowledge:");
  console.log(`  Decisions: ${knowledge.decisions.length}`);
  console.log(`  Patterns: ${knowledge.patterns.length}`);
  console.log(`  Tasks: ${knowledge.tasks.length}`);
  console.log(`  Insights: ${knowledge.insights.length}`);

  if (knowledge.decisions.length > 0) {
    console.log("\n  Decisions:");
    for (const d of knowledge.decisions) {
      console.log(`    - [${d.topic}] ${d.decision}`);
    }
  }

  // Cleanup
  await rm(TEST_DIR, { recursive: true, force: true });
}

main().catch(console.error);
