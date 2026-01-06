#!/usr/bin/env bun

/**
 * Debug regex patterns for compact marker format
 */

export {}; // Make this a module

const DECISION_MARKER = /^\[D\]\s*([^:]+):\s*(.+)$/gim;
const PATTERN_MARKER = /^\[P\]\s*([^:]+):\s*(.+)$/gim;
const TASK_MARKER = /^\[T\]\s*(.+)$/gim;
const INSIGHT_MARKER = /^\[I\]\s*(.+)$/gim;

const text = `[D] runtime: Using Bun for fast TypeScript execution
[D] framework: Going with Hono for lightweight API routing
[P] error-handling: Always wrap async code in try-catch
[T] Add more unit tests
[I] Compact markers save ~60% tokens`;

console.log("Testing compact marker regex patterns:");
console.log("Source text:");
console.log(text);
console.log();

console.log("=== Decisions ===");
let re = new RegExp(DECISION_MARKER.source, "gim");
let m;
while ((m = re.exec(text)) !== null) {
  console.log(`  Topic: "${m[1]}" -> Decision: "${m[2]}"`);
}

console.log("\n=== Patterns ===");
re = new RegExp(PATTERN_MARKER.source, "gim");
while ((m = re.exec(text)) !== null) {
  console.log(`  Name: "${m[1]}" -> Description: "${m[2]}"`);
}

console.log("\n=== Tasks ===");
re = new RegExp(TASK_MARKER.source, "gim");
while ((m = re.exec(text)) !== null) {
  console.log(`  Task: "${m[1]}"`);
}

console.log("\n=== Insights ===");
re = new RegExp(INSIGHT_MARKER.source, "gim");
while ((m = re.exec(text)) !== null) {
  console.log(`  Insight: "${m[1]}"`);
}
