#!/usr/bin/env bun

/**
 * Debug the full extraction pipeline
 */

import { parseTranscript } from "../skills/tenax/lib/transcript-parser";
import { scoreCandidate } from "../skills/tenax/lib/extraction-scorer";

async function main() {
  const transcriptPath = ".claude/tenax/sessions/002.jsonl";

  console.log("=== Debug Extraction Pipeline ===\n");

  const transcript = await parseTranscript(transcriptPath);

  // System content blocklist (same as extractor)
  const SYSTEM_BLOCKLIST = [
    /system-reminder/i,
    /<system-reminder>/i,
    /CRITICAL:.*READ-ONLY/i,
    /malware/i,
    /refuse to improve/i,
  ];

  function isSystemContent(text: string): boolean {
    return SYSTEM_BLOCKLIST.some(p => p.test(text));
  }

  // Filter messages
  const filtered = transcript.assistantMessages
    .filter(msg => !isSystemContent(msg))
    .map(msg => msg.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "").trim())
    .filter(msg => msg.length > 0);

  console.log(`Filtered messages: ${filtered.length}`);

  // Decision triggers
  const DECISION_TRIGGERS = [
    /\b(we(?:'ve)?|I(?:'ve)?|the team)\s+(decided|chose|selected|opted|went with|will use|are using)/i,
    /\b(going with|choosing|using|picking|selecting)\s+\w+/i,
    /\b(decided to|chose to|opted to|going to use)\b/i,
    /\bfor\s+\w+[^,]*,\s*(we|I)(?:'ll)?\s+(use|implement|go with)/i,
  ];

  // Search for trigger matches
  console.log("\n=== Searching for Decision Triggers ===\n");

  let matchCount = 0;
  for (const msg of filtered.slice(0, 10)) {
    for (const trigger of DECISION_TRIGGERS) {
      const regex = new RegExp(trigger.source, trigger.flags + "g");
      let match;
      while ((match = regex.exec(msg)) !== null) {
        matchCount++;
        const context = msg.slice(Math.max(0, match.index - 20), match.index + 100);
        console.log(`Match #${matchCount}:`);
        console.log(`  Trigger: ${trigger.source.substring(0, 40)}...`);
        console.log(`  Context: "...${context}..."`);
        console.log();

        if (matchCount >= 10) break;
      }
      if (matchCount >= 10) break;
    }
    if (matchCount >= 10) break;
  }

  if (matchCount === 0) {
    console.log("NO TRIGGER MATCHES FOUND!");
    console.log("\nSample messages to inspect:");
    for (const msg of filtered.slice(0, 3)) {
      console.log(`\n--- Message ---`);
      console.log(msg.substring(0, 500));
    }
  }
}

main().catch(console.error);
