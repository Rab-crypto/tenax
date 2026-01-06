#!/usr/bin/env bun

/**
 * Integration tests for project-memory plugin
 * Simulates multiple sessions with PreCompact and SessionEnd hooks
 */

import { join } from "path";
import { rm, mkdir } from "fs/promises";

const TEST_PROJECT = join(import.meta.dir, "test-project");
const MEMORY_PATH = join(TEST_PROJECT, ".claude", "project-memory");
const SCRIPTS_PATH = join(import.meta.dir, "..", "skills", "project-memory", "scripts");
const BUN_PATH = process.execPath; // Use the same bun that's running this script

// Test transcript content
function createTestTranscript(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((m, i) => JSON.stringify({
      type: "message",
      role: m.role,
      content: m.content,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    }))
    .join("\n");
}

// Simulate hook input
async function runCaptureSession(
  hookEvent: "PreCompact" | "SessionEnd",
  sessionId: string,
  transcriptContent: string
): Promise<void> {
  // Write transcript to temp file
  const transcriptPath = join(TEST_PROJECT, `transcript-${sessionId}.jsonl`);
  await Bun.write(transcriptPath, transcriptContent);

  const hookInput = {
    session_id: sessionId,
    transcript_path: transcriptPath,
    cwd: TEST_PROJECT,
    permission_mode: "default",
    hook_event_name: hookEvent,
  };

  // Write hook input to temp file (Bun.stdin.text() doesn't work well with Blob)
  const hookInputPath = join(TEST_PROJECT, `hook-input-${sessionId}.json`);
  await Bun.write(hookInputPath, JSON.stringify(hookInput));

  const proc = Bun.spawn([BUN_PATH, join(SCRIPTS_PATH, "capture-session.ts"), hookInputPath], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PROJECT_ROOT: TEST_PROJECT },
  });

  await proc.exited;

  const stderr = await new Response(proc.stderr).text();
  console.log(`  [${hookEvent}] ${stderr.trim()}`);
}

async function runScript(script: string, args: string[] = []): Promise<any> {
  const proc = Bun.spawn([BUN_PATH, join(SCRIPTS_PATH, script), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PROJECT_ROOT: TEST_PROJECT },
  });

  await proc.exited;
  const stdout = await new Response(proc.stdout).text();

  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}

async function cleanUp(): Promise<void> {
  try {
    await rm(TEST_PROJECT, { recursive: true, force: true });
  } catch {}
}

async function setup(): Promise<void> {
  await cleanUp();
  await mkdir(TEST_PROJECT, { recursive: true });

  // Initialize memory
  const result = await runScript("init.ts");
  console.log("Setup:", result.message);
}

// ============================================
// TEST CASES
// ============================================

async function testSingleSession(): Promise<boolean> {
  console.log("\n=== Test 1: Single Session ===");

  const transcript = createTestTranscript([
    { role: "user", content: "Let's use TypeScript for this project" },
    { role: "assistant", content: "I've decided to use TypeScript with strict mode enabled. This will help catch errors early." },
    { role: "user", content: "What about the database?" },
    { role: "assistant", content: "I'll go with PostgreSQL. The rationale is that we need ACID compliance and complex queries." },
  ]);

  await runCaptureSession("SessionEnd", "session-001", transcript);

  const summary = await runScript("get-summary.ts");
  console.log(`  Sessions: ${summary.data.stats.totalSessions}`);
  console.log(`  Decisions: ${summary.data.stats.totalDecisions}`);

  const pass = summary.data.stats.totalSessions === 1;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

async function testPreCompactThenSessionEnd(): Promise<boolean> {
  console.log("\n=== Test 2: PreCompact + SessionEnd (Same Session) ===");

  // First part of conversation (before compact)
  const transcript1 = createTestTranscript([
    { role: "user", content: "We need authentication" },
    { role: "assistant", content: "I decided to use JWT tokens for authentication. The rationale is stateless scalability." },
    { role: "user", content: "And for the frontend?" },
    { role: "assistant", content: "Going with React. It has great ecosystem support." },
  ]);

  await runCaptureSession("PreCompact", "session-002", transcript1);

  let summary = await runScript("get-summary.ts");
  const decisionsAfterPreCompact = summary.data.stats.totalDecisions;
  console.log(`  After PreCompact: ${decisionsAfterPreCompact} decisions`);

  // Same session continues after compact (summarized + new content)
  const transcript2 = createTestTranscript([
    { role: "user", content: "[Summary: Discussed auth with JWT and React frontend]" },
    { role: "assistant", content: "As discussed, we're using JWT and React." },
    { role: "user", content: "What about testing?" },
    { role: "assistant", content: "I've decided to use Vitest for testing. It's fast and compatible with our setup." },
  ]);

  await runCaptureSession("SessionEnd", "session-002", transcript2);

  summary = await runScript("get-summary.ts");
  const decisionsAfterSessionEnd = summary.data.stats.totalDecisions;
  console.log(`  After SessionEnd: ${decisionsAfterSessionEnd} decisions`);
  console.log(`  Sessions: ${summary.data.stats.totalSessions}`);

  // Should have 2 sessions total (test1 + test2) and more decisions
  // The key test: SessionEnd should add new decisions without duplicating PreCompact ones
  const pass = summary.data.stats.totalSessions === 2 && decisionsAfterSessionEnd >= decisionsAfterPreCompact;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

async function testMultipleSessions(): Promise<boolean> {
  console.log("\n=== Test 3: Multiple Independent Sessions ===");

  const transcript3 = createTestTranscript([
    { role: "user", content: "Let's add caching" },
    { role: "assistant", content: "I decided to use Redis for caching. It's fast and supports pub/sub." },
  ]);

  await runCaptureSession("SessionEnd", "session-003", transcript3);

  const transcript4 = createTestTranscript([
    { role: "user", content: "We need logging" },
    { role: "assistant", content: "Going with Pino for logging. It's the fastest JSON logger for Node." },
  ]);

  await runCaptureSession("SessionEnd", "session-004", transcript4);

  const summary = await runScript("get-summary.ts");
  console.log(`  Total Sessions: ${summary.data.stats.totalSessions}`);
  console.log(`  Total Decisions: ${summary.data.stats.totalDecisions}`);

  const pass = summary.data.stats.totalSessions === 4;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

async function testSearch(): Promise<boolean> {
  console.log("\n=== Test 4: Semantic Search ===");

  const result = await runScript("search.ts", ["authentication"]);
  console.log(`  Query: "authentication"`);
  console.log(`  Results: ${result.data.totalResults}`);

  if (result.data.results.length > 0) {
    console.log(`  Top result: ${result.data.results[0].snippet.substring(0, 60)}...`);
  }

  const pass = result.data.totalResults > 0;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

async function testListSessions(): Promise<boolean> {
  console.log("\n=== Test 5: List Sessions ===");

  const result = await runScript("list-sessions.ts");
  console.log(`  Found ${result.data.sessions.length} sessions`);

  for (const session of result.data.sessions) {
    console.log(`    - Session ${session.id}: ${session.decisionsCount} decisions`);
  }

  const pass = result.data.sessions.length === 4;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

async function testDeduplication(): Promise<boolean> {
  console.log("\n=== Test 6: Deduplication (PreCompact + SessionEnd with Same Content) ===");

  // Same content in both hooks - should not duplicate
  const transcript = createTestTranscript([
    { role: "user", content: "What ORM should we use?" },
    { role: "assistant", content: "I decided to use Prisma as our ORM. It has great TypeScript support." },
  ]);

  const summaryBefore = await runScript("get-summary.ts");
  const decisionsBefore = summaryBefore.data.stats.totalDecisions;

  await runCaptureSession("PreCompact", "session-005", transcript);

  const summaryAfterPreCompact = await runScript("get-summary.ts");
  const decisionsAfterPreCompact = summaryAfterPreCompact.data.stats.totalDecisions;
  const addedByPreCompact = decisionsAfterPreCompact - decisionsBefore;
  console.log(`  PreCompact added: ${addedByPreCompact} decisions`);

  // Same exact content for SessionEnd
  await runCaptureSession("SessionEnd", "session-005", transcript);

  const summaryAfterSessionEnd = await runScript("get-summary.ts");
  const decisionsAfterSessionEnd = summaryAfterSessionEnd.data.stats.totalDecisions;
  const addedBySessionEnd = decisionsAfterSessionEnd - decisionsAfterPreCompact;
  console.log(`  SessionEnd added: ${addedBySessionEnd} decisions`);

  // SessionEnd should add 0 new decisions (all duplicates)
  const pass = addedBySessionEnd === 0 && summaryAfterSessionEnd.data.stats.totalSessions === 5;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

async function testRecordDecision(): Promise<boolean> {
  console.log("\n=== Test 7: Manual Record Decision ===");

  const summaryBefore = await runScript("get-summary.ts");
  const decisionsBefore = summaryBefore.data.stats.totalDecisions;

  // Record a decision manually
  const proc = Bun.spawn([
    BUN_PATH, join(SCRIPTS_PATH, "record-decision.ts"),
    "-t", "deployment",
    "-r", "We need containerization for consistent environments",
    "Use Docker for containerization"
  ], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PROJECT_ROOT: TEST_PROJECT },
  });

  await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const result = JSON.parse(stdout);
  console.log(`  Recorded: ${result.message}`);

  const summaryAfter = await runScript("get-summary.ts");
  const decisionsAfter = summaryAfter.data.stats.totalDecisions;

  const pass = decisionsAfter === decisionsBefore + 1;
  console.log(pass ? "  ✓ PASS" : "  ✗ FAIL");
  return pass;
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════╗");
  console.log("║  Project Memory Integration Tests      ║");
  console.log("╚════════════════════════════════════════╝");

  await setup();

  const results: boolean[] = [];

  results.push(await testSingleSession());
  results.push(await testPreCompactThenSessionEnd());
  results.push(await testMultipleSessions());
  results.push(await testSearch());
  results.push(await testListSessions());
  results.push(await testDeduplication());
  results.push(await testRecordDecision());

  console.log("\n════════════════════════════════════════");
  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log("✓ All tests passed!");
  } else {
    console.log("✗ Some tests failed");
    process.exit(1);
  }

  // Cleanup
  await cleanUp();
}

main().catch(console.error);
