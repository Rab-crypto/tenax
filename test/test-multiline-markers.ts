#!/usr/bin/env bun

/**
 * Test both single-line and multi-line marker extraction
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { parseTranscript } from "../skills/project-memory/lib/transcript-parser";
import { extractAllKnowledge } from "../skills/project-memory/lib/extractor";

const projectRoot = process.cwd();
const testSessionsPath = join(projectRoot, ".claude", "project-memory", "sessions");

if (!existsSync(testSessionsPath)) {
  mkdirSync(testSessionsPath, { recursive: true });
}

// Mock transcript with both single-line and multi-line markers
const mockTranscript = [
  {
    type: "user",
    message: { role: "user", content: "Let's plan the architecture" },
    timestamp: new Date().toISOString()
  },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: `Here's my architecture recommendation:

## Single-line decisions

[DECISION: runtime] Using Bun for fast TypeScript execution

[DECISION: framework] Going with Hono for lightweight API routing

## Multi-line decision

[DECISION: database]
Using PostgreSQL for the database because:
- Strong ACID compliance
- Excellent JSON support with JSONB
- Rich ecosystem of tools
- Horizontal scaling with read replicas
[/]

## Patterns

[PATTERN: error-handling] Wrap route handlers in try-catch with standardized responses

[PATTERN: repository]
Abstract database access through repository classes:
- One repository per domain entity
- Inject database connection via constructor
- Return domain objects, not raw rows
- Handle transactions at service layer
[/]

## Tasks

[TASK: high] Set up CI/CD pipeline

[TASK: medium]
Write comprehensive API documentation:
- OpenAPI/Swagger spec
- Example requests for each endpoint
- Error response documentation
[/]

## Insights

[INSIGHT] PostgreSQL JSONB indexes can make document queries as fast as relational

[INSIGHT]
Connection pooling is critical for serverless:
- Use PgBouncer or similar
- Set pool size based on concurrent functions
- Monitor for connection exhaustion
[/]`
    },
    timestamp: new Date().toISOString()
  }
];

async function runTest() {
  console.log("=== Testing Single-line and Multi-line Markers ===\n");

  // Write test transcript
  const testFile = join(testSessionsPath, "test-multiline.jsonl");
  const lines = mockTranscript.map(entry => JSON.stringify(entry)).join("\n");
  writeFileSync(testFile, lines);

  // Parse and extract
  const transcript = await parseTranscript(testFile);

  // Debug: show what's being parsed
  console.log("Assistant messages:", transcript.assistantMessages.length);
  console.log("First message preview:", transcript.assistantMessages[0]?.substring(0, 200));
  console.log();

  const knowledge = await extractAllKnowledge(transcript, "test-multiline");

  // Report results
  console.log("=== DECISIONS ===");
  for (const d of knowledge.decisions) {
    const preview = d.decision.length > 80
      ? d.decision.substring(0, 80) + "..."
      : d.decision;
    const isMultiline = d.decision.includes("\n") || d.decision.length > 100;
    console.log(`[${d.topic}] ${isMultiline ? "(MULTI)" : "(SINGLE)"}`);
    console.log(`  ${preview.replace(/\n/g, "\\n")}`);
    console.log();
  }

  console.log("=== PATTERNS ===");
  for (const p of knowledge.patterns) {
    const isMultiline = p.description.includes("\n") || p.description.length > 100;
    console.log(`[${p.name}] ${isMultiline ? "(MULTI)" : "(SINGLE)"}`);
    console.log(`  ${p.description.substring(0, 80).replace(/\n/g, "\\n")}...`);
    console.log();
  }

  console.log("=== TASKS ===");
  for (const t of knowledge.tasks) {
    const isMultiline = (t.description?.length || 0) > 0;
    console.log(`[${t.priority}] ${isMultiline ? "(MULTI)" : "(SINGLE)"} ${t.title}`);
    if (t.description) {
      console.log(`  Description: ${t.description.substring(0, 60).replace(/\n/g, "\\n")}...`);
    }
    console.log();
  }

  console.log("=== INSIGHTS ===");
  for (const i of knowledge.insights) {
    const isMultiline = i.content.includes("\n") || i.content.length > 100;
    console.log(`${isMultiline ? "(MULTI)" : "(SINGLE)"}`);
    console.log(`  ${i.content.substring(0, 80).replace(/\n/g, "\\n")}...`);
    console.log();
  }

  // Verification
  console.log("=== VERIFICATION ===");
  const expected = {
    decisions: 3,  // runtime, framework, database(multi)
    patterns: 2,   // error-handling, repository(multi)
    tasks: 2,      // ci/cd, documentation(multi)
    insights: 2    // jsonb, pooling(multi)
  };

  let passed = true;

  const checks = [
    { name: "DECISIONS", got: knowledge.decisions.length, want: expected.decisions },
    { name: "PATTERNS", got: knowledge.patterns.length, want: expected.patterns },
    { name: "TASKS", got: knowledge.tasks.length, want: expected.tasks },
    { name: "INSIGHTS", got: knowledge.insights.length, want: expected.insights },
  ];

  for (const check of checks) {
    if (check.got === check.want) {
      console.log(`✓ ${check.name}: ${check.got}`);
    } else {
      console.log(`❌ ${check.name}: Expected ${check.want}, got ${check.got}`);
      passed = false;
    }
  }

  // Check that multi-line content was captured
  const multilineDecision = knowledge.decisions.find(d => d.topic === "database");
  if (multilineDecision && multilineDecision.decision.includes("ACID compliance")) {
    console.log("✓ Multi-line decision content captured");
  } else {
    console.log("❌ Multi-line decision content NOT captured");
    passed = false;
  }

  const multilinePattern = knowledge.patterns.find(p => p.name === "repository");
  if (multilinePattern && multilinePattern.description.includes("domain entity")) {
    console.log("✓ Multi-line pattern content captured");
  } else {
    console.log("❌ Multi-line pattern content NOT captured");
    passed = false;
  }

  // Cleanup
  rmSync(testFile);
  console.log("\nCleaned up test file");

  if (passed) {
    console.log("\n=== ALL TESTS PASSED ===");
  } else {
    console.log("\n=== SOME TESTS FAILED ===");
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
