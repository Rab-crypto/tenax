#!/usr/bin/env bun

/**
 * Debug the extractor to see why markers aren't being captured
 * Updated to use compact marker format: [D], [P], [I], [T]
 */

export {}; // Make this a module

const SYSTEM_BLOCKLIST = [
  /system-reminder/i,
  /<system-reminder>/i,
  /<\/system-reminder>/i,
  /CRITICAL:.*READ-ONLY/i,
  /malware/i,
  /refuse to improve/i,
  /must not.*edit/i,
  /<function_results>/i,
  /<\/function_results>/i,
  /\[Omitted long matching line\]/i,
  /^\s*\/[^/]+\/[gimsuvy]*[,;]?\s*$/,
  /^\s*const\s+\w+_PATTERNS?\s*=/i,
  /^\s*export\s+(async\s+)?function/,
  /you should|you must|you can not|please ensure/i,
  /when.*user.*asks/i,
  /IMPORTANT:/i,
  /^\s*\d+→/,
];

function isSystemContent(text: string): boolean {
  return SYSTEM_BLOCKLIST.some((pattern) => pattern.test(text));
}

function filterExtractableMessages(messages: string[]): string[] {
  return messages
    .filter((msg) => {
      const isSystem = isSystemContent(msg);
      if (isSystem) console.log("FILTERED as system:", msg.substring(0, 50));
      return !isSystem;
    })
    .map((msg) => {
      let cleaned = msg
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
        .replace(/<function_results>[\s\S]*?<\/function_results>/gi, "");
      // Remove code blocks
      cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
      // Remove inline code
      cleaned = cleaned.replace(/`[^`]+`/g, "");
      return cleaned.trim();
    })
    .filter((msg) => msg.length > 0);
}

// Compact marker format
const DECISION_MARKER = /^\[D\]\s*([^:]+):\s*(.+)$/gim;
const PATTERN_MARKER = /^\[P\]\s*([^:]+):\s*(.+)$/gim;
const TASK_MARKER = /^\[T\]\s*(.+)$/gim;
const INSIGHT_MARKER = /^\[I\]\s*(.+)$/gim;

const testMessage = `Here's my architecture recommendation:

## Decisions
[D] runtime: Using Bun for fast TypeScript execution
[D] framework: Going with Hono for lightweight API routing
[D] database: Using PostgreSQL with JSONB support

## Patterns
[P] error-handling: Wrap all async operations in try-catch with logging

## Tasks
[T] Add unit tests for the new extractor
[T] Update documentation with new marker format

## Insights
[I] Compact markers reduce token usage by ~60% compared to verbose format`;

console.log("=== Testing Compact Marker Format ===\n");

const filtered = filterExtractableMessages([testMessage]);
console.log("After filtering:", filtered.length, "messages");
console.log();

const fullText = filtered.join("\n");
console.log("Full text length:", fullText.length);
console.log();

// Test decisions
console.log("=== Decision matches ===");
const decisionRegex = new RegExp(DECISION_MARKER.source, "gim");
let decisionMatch;
while ((decisionMatch = decisionRegex.exec(fullText)) !== null) {
  console.log("DECISION:", decisionMatch[1], "->", decisionMatch[2]);
}
console.log();

// Test patterns
console.log("=== Pattern matches ===");
const patternRegex = new RegExp(PATTERN_MARKER.source, "gim");
let patternMatch;
while ((patternMatch = patternRegex.exec(fullText)) !== null) {
  console.log("PATTERN:", patternMatch[1], "->", patternMatch[2]);
}
console.log();

// Test tasks
console.log("=== Task matches ===");
const taskRegex = new RegExp(TASK_MARKER.source, "gim");
let taskMatch;
while ((taskMatch = taskRegex.exec(fullText)) !== null) {
  console.log("TASK:", taskMatch[1]);
}
console.log();

// Test insights
console.log("=== Insight matches ===");
const insightRegex = new RegExp(INSIGHT_MARKER.source, "gim");
let insightMatch;
while ((insightMatch = insightRegex.exec(fullText)) !== null) {
  console.log("INSIGHT:", insightMatch[1]);
}
