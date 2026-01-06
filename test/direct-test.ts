#!/usr/bin/env bun

import { join } from "path";
import { mkdir, rm } from "fs/promises";

const BUN_PATH = process.execPath;
const TEST_DIR = join(import.meta.dir, "direct-project");
const SCRIPTS_PATH = join(import.meta.dir, "..", "skills", "project-memory", "scripts");

async function main() {
  // Setup
  await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  await mkdir(TEST_DIR, { recursive: true });

  // Create transcript
  const transcript = [
    { type: "user", content: "Let's use TypeScript" },
    { type: "assistant", content: "I've decided to use TypeScript with strict mode." },
  ].map((m, i) => JSON.stringify({ ...m, timestamp: new Date().toISOString() })).join("\n");

  const transcriptPath = join(TEST_DIR, "transcript.jsonl");
  await Bun.write(transcriptPath, transcript);
  console.log("Created transcript at:", transcriptPath);

  // Initialize memory first
  console.log("\n--- Initializing memory ---");
  const initProc = Bun.spawn([BUN_PATH, join(SCRIPTS_PATH, "init.ts")], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PROJECT_ROOT: TEST_DIR },
  });
  await initProc.exited;
  console.log("Init stdout:", await new Response(initProc.stdout).text());
  console.log("Init stderr:", await new Response(initProc.stderr).text());

  // Run capture-session
  console.log("\n--- Running capture-session ---");
  const hookInput = {
    session_id: "test-session-001",
    transcript_path: transcriptPath,
    cwd: TEST_DIR,
    permission_mode: "default",
    hook_event_name: "SessionEnd",
  };
  console.log("Hook input:", JSON.stringify(hookInput));

  const proc = Bun.spawn([BUN_PATH, join(SCRIPTS_PATH, "capture-session.ts")], {
    stdin: new Blob([JSON.stringify(hookInput)]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PROJECT_ROOT: TEST_DIR },
  });

  const exitCode = await proc.exited;
  console.log("Exit code:", exitCode);
  console.log("STDOUT:", await new Response(proc.stdout).text());
  console.log("STDERR:", await new Response(proc.stderr).text());

  // Check results
  console.log("\n--- Checking results ---");
  const summaryProc = Bun.spawn([BUN_PATH, join(SCRIPTS_PATH, "get-summary.ts")], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PROJECT_ROOT: TEST_DIR },
  });
  await summaryProc.exited;
  console.log("Summary:", await new Response(summaryProc.stdout).text());

  // Cleanup
  await rm(TEST_DIR, { recursive: true, force: true });
}

main().catch(console.error);
