#!/usr/bin/env bun

/**
 * Test the end-to-end capture flow that hooks use
 * Simulates what happens when PreCompact or SessionEnd triggers
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const projectRoot = process.cwd();
const captureScript = join(projectRoot, "skills", "project-memory", "scripts", "capture-session.ts");
const sessionsPath = join(projectRoot, ".claude", "project-memory", "sessions");
const indexPath = join(projectRoot, ".claude", "project-memory", "index.json");

// Create sessions directory if needed
if (!existsSync(sessionsPath)) {
  mkdirSync(sessionsPath, { recursive: true });
}

// Mock transcript entries (JSONL format)
const mockTranscriptEntries = [
  {
    type: "user",
    message: { role: "user", content: "Let's set up testing for our project" },
    timestamp: new Date().toISOString()
  },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: `I'll help you set up testing. Here's my recommendation:

[DECISION: testing-framework] Using Bun's built-in test runner because it's fast and requires no additional configuration

[DECISION: test-structure] Organizing tests in a __tests__ directory next to source files for better discoverability

[PATTERN: test-naming] Name test files with .test.ts suffix and use describe/it blocks for clear test organization

[TASK: high] Write unit tests for the authentication module

[TASK: medium] Set up test fixtures and mock data

[INSIGHT] Bun's test runner supports watch mode out of the box with --watch flag`
    },
    timestamp: new Date().toISOString()
  }
];

async function runTest() {
  console.log("=== Testing End-to-End Capture Flow ===\n");

  // Step 1: Create mock JSONL transcript file
  const transcriptFile = join(projectRoot, "test-transcript.jsonl");
  const jsonlContent = mockTranscriptEntries.map(e => JSON.stringify(e)).join("\n");
  writeFileSync(transcriptFile, jsonlContent);
  console.log("Created mock transcript: test-transcript.jsonl\n");

  // Step 2: Create proper HookInput
  const mockHookInput = {
    hook_event_name: "SessionEnd",
    session_id: "test-hook-session-" + Date.now(),
    cwd: projectRoot,
    transcript_path: transcriptFile,
    conversation_id: "test-conv-123"
  };

  const inputFile = join(projectRoot, "test-hook-input.json");
  writeFileSync(inputFile, JSON.stringify(mockHookInput));
  console.log("Created mock hook input file\n");

  // Run capture-session script with file input
  console.log("Running capture-session.ts...\n");

  const bunPath = process.execPath; // Use current bun executable
  const proc = Bun.spawn([bunPath, captureScript, inputFile], {
    cwd: projectRoot,
    stdio: ["inherit", "pipe", "pipe"],
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  console.log("STDOUT:", output || "(empty)");
  if (stderr) console.log("STDERR:", stderr);
  console.log("Exit code:", exitCode);
  console.log();

  if (exitCode !== 0) {
    console.log("❌ Capture script failed");

    // Cleanup
    Bun.spawnSync(["cmd", "/c", "del", inputFile]);
    Bun.spawnSync(["cmd", "/c", "del", transcriptFile]);
    process.exit(1);
  }

  // Verify session was saved
  console.log("=== Verification ===\n");

  // Check for JSONL transcript
  const files = await Bun.file(sessionsPath).exists()
    ? Bun.spawnSync(["cmd", "/c", "dir", "/b", sessionsPath]).stdout.toString().trim().split("\r\n")
    : [];

  const jsonlFiles = files.filter(f => f.endsWith(".jsonl"));
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  console.log(`JSONL files (transcripts): ${jsonlFiles.length}`);
  console.log(`JSON files (processed): ${jsonFiles.length}`);

  if (jsonlFiles.length === 0) {
    console.log("❌ No JSONL transcript created");
    Bun.spawnSync(["cmd", "/c", "del", inputFile]);
    process.exit(1);
  }

  if (jsonFiles.length === 0) {
    console.log("❌ No processed JSON created");
    Bun.spawnSync(["cmd", "/c", "del", inputFile]);
    process.exit(1);
  }

  // Read the processed session
  const latestJson = jsonFiles.sort().pop()!;
  const sessionData = JSON.parse(readFileSync(join(sessionsPath, latestJson), "utf-8"));

  console.log(`\nProcessed session: ${latestJson}`);
  console.log(`  Decisions: ${sessionData.decisions?.length || 0}`);
  console.log(`  Patterns: ${sessionData.patterns?.length || 0}`);
  console.log(`  Tasks: ${sessionData.tasks?.length || 0}`);
  console.log(`  Insights: ${sessionData.insights?.length || 0}`);

  // Check index was updated
  const index = JSON.parse(readFileSync(indexPath, "utf-8"));
  console.log(`\nIndex updated:`);
  console.log(`  Total sessions: ${index.totalSessions}`);
  console.log(`  Total decisions: ${index.totalDecisions}`);
  console.log(`  Total patterns: ${index.totalPatterns}`);

  // Verify expected counts
  const expectedDecisions = 2;
  const expectedPatterns = 1;
  const expectedTasks = 2;
  const expectedInsights = 1;

  let passed = true;

  if ((sessionData.decisions?.length || 0) !== expectedDecisions) {
    console.log(`\n❌ Expected ${expectedDecisions} decisions, got ${sessionData.decisions?.length || 0}`);
    passed = false;
  }

  if ((sessionData.patterns?.length || 0) !== expectedPatterns) {
    console.log(`\n❌ Expected ${expectedPatterns} patterns, got ${sessionData.patterns?.length || 0}`);
    passed = false;
  }

  if ((sessionData.tasks?.length || 0) !== expectedTasks) {
    console.log(`\n❌ Expected ${expectedTasks} tasks, got ${sessionData.tasks?.length || 0}`);
    passed = false;
  }

  if ((sessionData.insights?.length || 0) !== expectedInsights) {
    console.log(`\n❌ Expected ${expectedInsights} insights, got ${sessionData.insights?.length || 0}`);
    passed = false;
  }

  // Cleanup
  Bun.spawnSync(["cmd", "/c", "del", inputFile]);
  Bun.spawnSync(["cmd", "/c", "del", transcriptFile]);
  console.log("\nCleaned up test files");

  if (passed) {
    console.log("\n=== END-TO-END TEST PASSED ===");
  } else {
    console.log("\n=== END-TO-END TEST FAILED ===");
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
