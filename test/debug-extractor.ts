#!/usr/bin/env bun

/**
 * Debug the extractor to see why single-line markers aren't being captured
 */

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
      return msg
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
        .replace(/<function_results>[\s\S]*?<\/function_results>/gi, "")
        .trim();
    })
    .filter((msg) => msg.length > 0);
}

const DECISION_MARKER_SINGLE = /\[DECISION:\s*([^\]]+)\]\s*(.+[^:\s])$/gim;
const DECISION_MARKER_MULTI = /\[DECISION:\s*([^\]]+)\]\s*\n([\s\S]*?)\[\/\]/gi;

const testMessage = `Here's my architecture recommendation:

## Single-line decisions

[DECISION: runtime] Using Bun for fast TypeScript execution

[DECISION: framework] Going with Hono for lightweight API routing

## Multi-line decision

[DECISION: database]
Using PostgreSQL for the database because:
- Strong ACID compliance
- Excellent JSON support with JSONB
[/]`;

console.log("=== Testing Extractor Flow ===\n");

const filtered = filterExtractableMessages([testMessage]);
console.log("After filtering:", filtered.length, "messages");
console.log();

const fullText = filtered.join("\n");
console.log("Full text length:", fullText.length);
console.log();

// Test multi-line first
console.log("=== Multi-line matches ===");
const multiRegex = new RegExp(DECISION_MARKER_MULTI.source, "gi");
let multiMatch;
while ((multiMatch = multiRegex.exec(fullText)) !== null) {
  console.log("MULTI:", multiMatch[1], "->", multiMatch[2]?.substring(0, 50));
}
console.log();

// Test single-line
console.log("=== Single-line matches ===");
const singleRegex = new RegExp(DECISION_MARKER_SINGLE.source, "gim");
let singleMatch;
while ((singleMatch = singleRegex.exec(fullText)) !== null) {
  console.log("SINGLE:", singleMatch[1], "->", singleMatch[2]);
}
