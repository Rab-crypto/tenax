#!/usr/bin/env bun

/**
 * Debug script to see why extraction is returning 0 results
 */

import { parseTranscript } from "../skills/project-memory/lib/transcript-parser";
import { scoreCandidate } from "../skills/project-memory/lib/extraction-scorer";

const projectRoot = process.cwd();

async function main() {
  const transcriptPath = ".claude/project-memory/sessions/002.jsonl";

  console.log("=== Debug Extraction ===\n");

  // Parse transcript
  const transcript = await parseTranscript(transcriptPath);
  console.log(`User messages: ${transcript.userMessages.length}`);
  console.log(`Assistant messages: ${transcript.assistantMessages.length}`);

  // Test some sample sentences against the scorer
  const testSentences = [
    "We decided to use Bun as the runtime because it has native TypeScript support",
    "Going with React for the frontend",
    "Using SQLite for storage",
    "We chose to implement this using a hybrid approach",
    "The fix works now",
    "This is a test",
    "the plugin:",
  ];

  console.log("\n=== Testing Quality Scoring ===\n");

  for (const sentence of testSentences) {
    const score = await scoreCandidate(sentence, "decision");
    console.log(`"${sentence.substring(0, 50)}..."`);
    console.log(`  Score: ${(score.score * 100).toFixed(1)}%, Passed: ${score.passed}`);
    console.log(`  Reasons: ${score.reasons?.join(", ")}`);
    console.log();
  }

  // Now test actual assistant messages
  console.log("\n=== Testing Actual Assistant Messages ===\n");

  // Get first 3 non-empty assistant messages
  const messages = transcript.assistantMessages
    .filter(m => m.length > 50)
    .slice(0, 3);

  for (const msg of messages) {
    console.log(`Message preview: "${msg.substring(0, 100)}..."`);

    // Try to score the full message
    const score = await scoreCandidate(msg.substring(0, 200), "decision");
    console.log(`  Score: ${(score.score * 100).toFixed(1)}%, Passed: ${score.passed}`);
    console.log();
  }
}

main().catch(console.error);
