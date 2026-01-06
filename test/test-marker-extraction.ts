#!/usr/bin/env bun

/**
 * Test the marker-based extraction system
 * Creates a mock transcript with markers and verifies extraction
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { parseTranscript } from "../skills/project-memory/lib/transcript-parser";
import { extractAllKnowledge } from "../skills/project-memory/lib/extractor";

const projectRoot = process.cwd();
const testSessionsPath = join(projectRoot, ".claude", "project-memory", "sessions");

// Create test directory if needed
if (!existsSync(testSessionsPath)) {
  mkdirSync(testSessionsPath, { recursive: true });
}

// Mock transcript with markers
const mockTranscript = [
  // User asks about building an API
  {
    type: "user",
    message: {
      role: "user",
      content: "I want to build a REST API for my project. What stack should we use?"
    },
    timestamp: new Date().toISOString()
  },
  // Assistant responds with decisions using markers
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: `I'll help you build a REST API. Based on your project requirements, here's what I recommend:

## Technology Stack

[DECISION: runtime] Using Bun as the runtime because it has native TypeScript support and excellent performance

[DECISION: framework] Going with Hono for the API framework because it's lightweight, fast, and has great TypeScript support

[DECISION: database] Using SQLite with Drizzle ORM for the database layer because it requires no separate server process

[DECISION: validation] Implementing Zod for request/response validation because it integrates well with TypeScript

## Patterns

[PATTERN: error-handling] Wrap all route handlers in a try-catch middleware that returns standardized error responses with proper HTTP status codes

[PATTERN: validation-middleware] Use Zod schemas at the route level to validate request bodies before they reach the handler

## Remaining Work

[TASK: high] Set up the project structure with Bun and install dependencies

[TASK: medium] Create the database schema and migrations

[TASK: low] Add API documentation with OpenAPI/Swagger

## Observations

[INSIGHT] Bun's native SQLite support means we don't need additional dependencies for database access

[INSIGHT] Hono's middleware pattern makes it easy to compose authentication and validation

Let me know if you'd like me to start implementing any of these components!`
    },
    timestamp: new Date().toISOString()
  },
  // User asks follow-up
  {
    type: "user",
    message: {
      role: "user",
      content: "Great! Let's also decide on authentication"
    },
    timestamp: new Date().toISOString()
  },
  // Assistant adds more decisions
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: `For authentication, here's what I recommend:

[DECISION: authentication] Implementing JWT-based authentication with refresh tokens for stateless session management

[DECISION: password-hashing] Using bcrypt for password hashing with a cost factor of 12

[PATTERN: auth-middleware] Check JWT in Authorization header, verify signature, and attach user to request context

[TASK: high] Implement login and signup endpoints with proper password hashing

[INSIGHT] JWT refresh tokens should be stored in HttpOnly cookies to prevent XSS attacks`
    },
    timestamp: new Date().toISOString()
  }
];

async function runTest() {
  console.log("=== Testing Marker-Based Extraction ===\n");

  // Write test transcript
  const testFile = join(testSessionsPath, "test-markers.jsonl");
  const lines = mockTranscript.map(entry => JSON.stringify(entry)).join("\n");
  writeFileSync(testFile, lines);
  console.log("Created test transcript: test-markers.jsonl\n");

  // Parse transcript
  const transcript = await parseTranscript(testFile);
  console.log(`Parsed ${transcript.entries.length} entries`);
  console.log(`User messages: ${transcript.userMessages.length}`);
  console.log(`Assistant messages: ${transcript.assistantMessages.length}`);
  console.log();

  // Extract knowledge
  console.log("Extracting knowledge...\n");
  const knowledge = await extractAllKnowledge(transcript, "test-markers");

  // Report results
  console.log("=== Extraction Results ===\n");

  console.log(`DECISIONS (${knowledge.decisions.length}):`);
  for (const d of knowledge.decisions) {
    console.log(`  [${d.topic}] ${d.decision.substring(0, 80)}...`);
  }
  console.log();

  console.log(`PATTERNS (${knowledge.patterns.length}):`);
  for (const p of knowledge.patterns) {
    console.log(`  [${p.name}] ${p.description.substring(0, 80)}...`);
  }
  console.log();

  console.log(`TASKS (${knowledge.tasks.length}):`);
  for (const t of knowledge.tasks) {
    console.log(`  [${t.priority || "medium"}] ${t.title}`);
  }
  console.log();

  console.log(`INSIGHTS (${knowledge.insights.length}):`);
  for (const i of knowledge.insights) {
    console.log(`  ${i.content.substring(0, 80)}...`);
  }
  console.log();

  // Verify expected counts
  console.log("=== Verification ===\n");
  const expected = {
    decisions: 6, // runtime, framework, database, validation, authentication, password-hashing
    patterns: 3,  // error-handling, validation-middleware, auth-middleware
    tasks: 4,     // setup, schema, docs, auth endpoints
    insights: 3   // SQLite, Hono middleware, JWT cookies
  };

  let passed = true;
  if (knowledge.decisions.length !== expected.decisions) {
    console.log(`❌ DECISIONS: Expected ${expected.decisions}, got ${knowledge.decisions.length}`);
    passed = false;
  } else {
    console.log(`✓ DECISIONS: ${knowledge.decisions.length} extracted correctly`);
  }

  if (knowledge.patterns.length !== expected.patterns) {
    console.log(`❌ PATTERNS: Expected ${expected.patterns}, got ${knowledge.patterns.length}`);
    passed = false;
  } else {
    console.log(`✓ PATTERNS: ${knowledge.patterns.length} extracted correctly`);
  }

  if (knowledge.tasks.length !== expected.tasks) {
    console.log(`❌ TASKS: Expected ${expected.tasks}, got ${knowledge.tasks.length}`);
    passed = false;
  } else {
    console.log(`✓ TASKS: ${knowledge.tasks.length} extracted correctly`);
  }

  if (knowledge.insights.length !== expected.insights) {
    console.log(`❌ INSIGHTS: Expected ${expected.insights}, got ${knowledge.insights.length}`);
    passed = false;
  } else {
    console.log(`✓ INSIGHTS: ${knowledge.insights.length} extracted correctly`);
  }

  console.log();

  // Cleanup
  rmSync(testFile);
  console.log("Cleaned up test file\n");

  if (passed) {
    console.log("=== ALL TESTS PASSED ===");
    process.exit(0);
  } else {
    console.log("=== SOME TESTS FAILED ===");
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
