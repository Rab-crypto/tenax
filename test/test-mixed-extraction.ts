#!/usr/bin/env bun

/**
 * Test that extraction works with both single-line and multi-line marker formats
 */

import { extractAllKnowledge } from "../skills/project-memory/lib/extractor";
import type { ParsedTranscript } from "../skills/project-memory/lib/transcript-parser";

// Test 1: Single-line format (backward compatible)
const SINGLE_LINE_FORMAT = `
Based on your requirements, I recommend using SQLite.

[D] database: Using SQLite for embedded storage - no separate server needed
[P] migrations: Use sequential SQL files in migrations/ folder
[T] Add unit tests for the database layer
[I] SQLite supports JSON columns natively

Let me implement this now.
`;

// Test 2: Multi-line format (new)
const MULTI_LINE_FORMAT = `
I've completed the frontend redesign with a modern aesthetic.

[D] Frontend redesign includes:
  - JetBrains Mono + Outfit typography
  - Bento grid features section with asymmetric cards
  - Timeline-style "How It Works" with glowing nodes
  - Redesigned terminal with syntax highlighting
  - Card-based CTA with gradient accent

[P] Bento grid implementation:
  - Use 12-column CSS grid
  - Cards span 4 or 8 columns
  - Tall cards span 2 rows
  - Gap of var(--space-lg) between cards

[I] Bun subprocess stdin behavior:
  - Bun.stdin.text() hangs when called in subprocess
  - Workaround: pass data via temp file argument
  - Node.js reads stdin, writes temp file, Bun reads file

[T] Remaining frontend work:
  - Add mobile responsive breakpoints
  - Test in Safari and Firefox
  - Add loading states for animations

Would you like me to commit these changes?
`;

// Test 3: Mixed format (both in same response)
const MIXED_FORMAT = `
Here's my analysis and recommendations:

[D] auth: JWT tokens with 15-minute expiry and refresh rotation

For the frontend, I made several changes:

[D] Frontend architecture decisions:
  - React with TypeScript for type safety
  - Zustand for state management (simpler than Redux)
  - TanStack Query for server state
  - Tailwind CSS with custom design tokens

[I] The API rate limits are per-user, not per-application

[P] error-handling: Wrap async operations in try-catch with structured logging

That covers the main decisions.
`;

async function runTest() {
  console.log("=== Testing Single-Line and Multi-Line Extraction ===\n");

  const testCases = [
    {
      name: "Single-line format (backward compatible)",
      content: SINGLE_LINE_FORMAT,
      expected: { decisions: 1, patterns: 1, tasks: 1, insights: 1 },
    },
    {
      name: "Multi-line format (new)",
      content: MULTI_LINE_FORMAT,
      expected: { decisions: 1, patterns: 1, tasks: 1, insights: 1 },
    },
    {
      name: "Mixed format (both styles)",
      content: MIXED_FORMAT,
      expected: { decisions: 2, patterns: 1, tasks: 0, insights: 1 },
    },
  ];

  let allPassed = true;

  for (const testCase of testCases) {
    console.log(`\n--- Test: ${testCase.name} ---`);

    const transcript: ParsedTranscript = {
      userMessages: ["Help me with the implementation"],
      assistantMessages: [testCase.content],
      toolCalls: [],
      timestamps: { start: new Date().toISOString() },
    };

    const result = await extractAllKnowledge(transcript, "test-001");

    console.log(`\nDecisions: ${result.decisions.length} (expected: ${testCase.expected.decisions})`);
    for (const d of result.decisions) {
      const preview = d.decision.length > 80
        ? d.decision.substring(0, 80) + "..."
        : d.decision;
      const multiLine = d.decision.includes("\n") ? " [MULTI-LINE]" : "";
      console.log(`  [D] ${d.topic}: ${preview}${multiLine}`);
    }

    console.log(`\nPatterns: ${result.patterns.length} (expected: ${testCase.expected.patterns})`);
    for (const p of result.patterns) {
      const preview = p.description.length > 80
        ? p.description.substring(0, 80) + "..."
        : p.description;
      const multiLine = p.description.includes("\n") ? " [MULTI-LINE]" : "";
      console.log(`  [P] ${p.name}: ${preview}${multiLine}`);
    }

    console.log(`\nInsights: ${result.insights.length} (expected: ${testCase.expected.insights})`);
    for (const i of result.insights) {
      const preview = i.content.length > 80
        ? i.content.substring(0, 80) + "..."
        : i.content;
      const multiLine = i.content.includes("\n") ? " [MULTI-LINE]" : "";
      console.log(`  [I] ${preview}${multiLine}`);
    }

    console.log(`\nTasks: ${result.tasks.length} (expected: ${testCase.expected.tasks})`);
    for (const t of result.tasks) {
      const preview = t.title.length > 80
        ? t.title.substring(0, 80) + "..."
        : t.title;
      const multiLine = (t.description?.includes("\n")) ? " [MULTI-LINE]" : "";
      console.log(`  [T] ${preview}${multiLine}`);
    }

    // Validate counts
    const checks = [
      { name: "decisions", actual: result.decisions.length, expected: testCase.expected.decisions },
      { name: "patterns", actual: result.patterns.length, expected: testCase.expected.patterns },
      { name: "insights", actual: result.insights.length, expected: testCase.expected.insights },
      { name: "tasks", actual: result.tasks.length, expected: testCase.expected.tasks },
    ];

    for (const check of checks) {
      if (check.actual < check.expected) {
        console.log(`\n❌ FAIL: Expected at least ${check.expected} ${check.name}, got ${check.actual}`);
        allPassed = false;
      }
    }
  }

  // Test 4: Verify multi-line content is preserved
  console.log("\n\n--- Test: Multi-line content preservation ---");
  const transcript: ParsedTranscript = {
    userMessages: ["Test"],
    assistantMessages: [MULTI_LINE_FORMAT],
    toolCalls: [],
    timestamps: { start: new Date().toISOString() },
  };

  const result = await extractAllKnowledge(transcript, "test-002");

  const multiLineDecision = result.decisions.find(d => d.decision.includes("JetBrains Mono"));
  if (multiLineDecision) {
    const lineCount = multiLineDecision.decision.split("\n").length;
    console.log(`Multi-line decision has ${lineCount} lines`);
    if (lineCount >= 5) {
      console.log("✅ Multi-line content preserved correctly");
    } else {
      console.log("❌ FAIL: Multi-line content was truncated");
      allPassed = false;
    }
  } else {
    console.log("❌ FAIL: Multi-line decision not found");
    allPassed = false;
  }

  console.log("\n=== Summary ===");
  if (allPassed) {
    console.log("✅ All tests passed");
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

runTest().catch(console.error);
