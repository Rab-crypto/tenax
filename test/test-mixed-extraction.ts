#!/usr/bin/env bun

/**
 * Test that extraction works when markers are embedded in user-friendly responses
 */

import { extractAllKnowledge } from "../skills/project-memory/lib/extractor";
import type { ParsedTranscript } from "../skills/project-memory/lib/transcript-parser";

// Simulate a realistic response that has BOTH user-friendly content AND markers
const MIXED_RESPONSE = `
I've redesigned the homepage with a "Precision Engineering" aesthetic direction.

**Changes Made:**
1. **Typography**: Added JetBrains Mono and Outfit fonts for distinctive character
2. **Features Section**: Bento grid layout with asymmetric cards and animated orbs
3. **How It Works**: Timeline with alternating content cards and glowing nodes
4. **Terminal**: Redesigned with syntax highlighting

The hero section was preserved as requested. All new styles are inline in the \`<style>\` tag.

[D] frontend-design: Chose "Precision Engineering" aesthetic - technical feel with JetBrains Mono + Outfit fonts
[D] layout-pattern: Bento grid with 12-column system and span modifiers for asymmetric cards
[P] terminal-syntax: Color-code terminal output with prompt, command, string, flag, comment classes
[I] Inline page-specific styles in style tag keeps CSS co-located with HTML
[T] Add responsive breakpoints for mobile view

Would you like me to commit these changes?
`;

// Another realistic example with markers inline in the flow
const INLINE_MARKERS_RESPONSE = `
Based on your requirements, I recommend using SQLite for the database.

[D] database: Using SQLite for embedded storage - no separate server needed

The main advantages are:
- Zero configuration
- Single file storage
- Great for development

[P] db-migrations: Use simple SQL files in migrations/ folder, run in order by filename

I'll also need to set up the schema. Here's what I'm thinking:

[I] SQLite supports JSON columns natively which simplifies storing flexible data

Let me implement this now...
`;

// Edge case: markers at very end after lots of content
const MARKERS_AT_END = `
I spent considerable time analyzing the codebase. Here's what I found:

The authentication system uses JWT tokens stored in httpOnly cookies. The refresh
token rotation is handled by middleware in \`auth/middleware.ts\`. Session management
is done through Redis with a 24-hour TTL.

For the API layer, we have REST endpoints following resource-based naming. GraphQL
was considered but rejected due to team familiarity concerns.

The frontend uses React with TypeScript. State management is handled by Zustand
which was chosen over Redux for its simpler API.

After this analysis, here are the key findings:

[D] auth: JWT tokens in httpOnly cookies with refresh rotation
[D] api: REST endpoints with resource-based naming, GraphQL rejected
[D] state: Zustand for state management over Redux
[I] Redis sessions have 24-hour TTL configured in auth middleware
`;

async function runTest() {
  console.log("=== Testing Mixed Content Extraction ===\n");

  const testCases = [
    { name: "User-friendly + grouped markers at end", content: MIXED_RESPONSE },
    { name: "Markers inline with explanations", content: INLINE_MARKERS_RESPONSE },
    { name: "Long analysis with markers at end", content: MARKERS_AT_END },
  ];

  let allPassed = true;

  for (const testCase of testCases) {
    console.log(`\n--- Test: ${testCase.name} ---`);

    const transcript: ParsedTranscript = {
      userMessages: ["Analyze and redesign the system"],
      assistantMessages: [testCase.content],
      toolCalls: [],
      timestamps: { start: new Date().toISOString() },
    };

    const result = await extractAllKnowledge(transcript, "test-001");

    console.log(`Decisions: ${result.decisions.length}`);
    for (const d of result.decisions) {
      console.log(`  [D] ${d.topic}: ${d.decision.substring(0, 60)}...`);
    }

    console.log(`Patterns: ${result.patterns.length}`);
    for (const p of result.patterns) {
      console.log(`  [P] ${p.name}: ${p.description.substring(0, 60)}...`);
    }

    console.log(`Insights: ${result.insights.length}`);
    for (const i of result.insights) {
      console.log(`  [I] ${i.content.substring(0, 60)}...`);
    }

    console.log(`Tasks: ${result.tasks.length}`);
    for (const t of result.tasks) {
      console.log(`  [T] ${t.title.substring(0, 60)}...`);
    }

    // Validate expected counts
    if (testCase.name.includes("grouped markers")) {
      // MIXED_RESPONSE should have: 2 decisions, 1 pattern, 1 insight, 1 task
      if (result.decisions.length < 2) {
        console.log("❌ FAIL: Expected at least 2 decisions");
        allPassed = false;
      }
      if (result.patterns.length < 1) {
        console.log("❌ FAIL: Expected at least 1 pattern");
        allPassed = false;
      }
      if (result.insights.length < 1) {
        console.log("❌ FAIL: Expected at least 1 insight");
        allPassed = false;
      }
      if (result.tasks.length < 1) {
        console.log("❌ FAIL: Expected at least 1 task");
        allPassed = false;
      }
    }

    if (testCase.name.includes("inline")) {
      // INLINE_MARKERS should have: 1 decision, 1 pattern, 1 insight
      if (result.decisions.length < 1) {
        console.log("❌ FAIL: Expected at least 1 decision");
        allPassed = false;
      }
      if (result.patterns.length < 1) {
        console.log("❌ FAIL: Expected at least 1 pattern");
        allPassed = false;
      }
      if (result.insights.length < 1) {
        console.log("❌ FAIL: Expected at least 1 insight");
        allPassed = false;
      }
    }

    if (testCase.name.includes("Long analysis")) {
      // MARKERS_AT_END should have: 3 decisions, 1 insight
      if (result.decisions.length < 3) {
        console.log("❌ FAIL: Expected at least 3 decisions");
        allPassed = false;
      }
      if (result.insights.length < 1) {
        console.log("❌ FAIL: Expected at least 1 insight");
        allPassed = false;
      }
    }
  }

  console.log("\n=== Summary ===");
  if (allPassed) {
    console.log("✅ All tests passed - extraction works with mixed content");
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

runTest().catch(console.error);
