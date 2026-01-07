#!/usr/bin/env bun

/**
 * Debug bullet extraction to see why we're only getting 2 decisions
 */

import { parseTranscript } from "../skills/tenax/lib/transcript-parser";
import { scoreCandidate } from "../skills/tenax/lib/extraction-scorer";

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
    .filter((msg) => !isSystemContent(msg))
    .map((msg) => {
      return msg
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
        .replace(/<function_results>[\s\S]*?<\/function_results>/gi, "")
        .trim();
    })
    .filter((msg) => msg.length > 0);
}

function parseStructure(text: string): Array<{type: string, content: string}> {
  const segments: Array<{type: string, content: string}> = [];
  const lines = text.split("\n");

  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch && bulletMatch[2]) {
      segments.push({ type: "bullet", content: bulletMatch[2] });
    }
  }

  return segments;
}

const ACTION_TRIGGERS = [
  /\b(updated?|changed?|switched|migrated|converted)\s+/i,
  /\b(added|implemented|created|built|introduced)\s+/i,
  /\b(replaced|removed|deprecated)\s+/i,
  /\b(fixed|resolved|addressed)\s+/i,
  /\b(using|uses?)\s+\w+\s+(for|to|with|instead)/i,
];

const STRUCTURED_PATTERN = /^\*\*\[([^\]]+)\]\*\*\s+(.+)$/;

async function main() {
  const transcript = await parseTranscript(".claude/tenax/sessions/002.jsonl");
  const messages = filterExtractableMessages(transcript.assistantMessages);

  console.log(`=== Debugging Bullet Extraction ===\n`);
  console.log(`Filtered messages: ${messages.length}\n`);

  let totalBullets = 0;
  let structuredMatches = 0;
  let actionMatches = 0;
  let scored = 0;
  let passed = 0;

  for (const message of messages) {
    const segments = parseStructure(message);
    const bullets = segments.filter((s) => s.type === "bullet");
    totalBullets += bullets.length;

    for (const bullet of bullets) {
      const content = bullet.content;

      // Check structured format
      const structuredMatch = content.match(STRUCTURED_PATTERN);
      if (structuredMatch) {
        structuredMatches++;
        const decisionText = structuredMatch[2] || "";
        console.log(`[STRUCTURED] topic=${structuredMatch[1]}`);
        console.log(`  Text: "${decisionText.slice(0, 80)}..."`);

        const quality = await scoreCandidate(decisionText, "decision");
        scored++;
        console.log(`  Score: ${(quality.score * 100).toFixed(1)}%, Passed: ${quality.passed}`);
        if (quality.passed) passed++;
        console.log();
        continue;
      }

      // Check action triggers
      for (const trigger of ACTION_TRIGGERS) {
        if (trigger.test(content)) {
          actionMatches++;
          const cleaned = content
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .trim();

          if (cleaned.length >= 20 && cleaned.length <= 500) {
            console.log(`[ACTION] ${trigger.source.slice(0, 30)}`);
            console.log(`  Text: "${cleaned.slice(0, 80)}..."`);

            const quality = await scoreCandidate(cleaned, "decision");
            scored++;
            console.log(`  Score: ${(quality.score * 100).toFixed(1)}%, Passed: ${quality.passed}`);
            if (quality.passed) passed++;
            console.log();
          }
          break;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total bullets: ${totalBullets}`);
  console.log(`Structured matches: ${structuredMatches}`);
  console.log(`Action matches: ${actionMatches}`);
  console.log(`Scored: ${scored}`);
  console.log(`Passed quality: ${passed}`);
}

main().catch(console.error);
