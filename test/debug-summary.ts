#!/usr/bin/env bun

import { parseTranscript } from "../skills/tenax/lib/transcript-parser";
import { generateSummary } from "../skills/tenax/lib/extractor";
import { readdirSync } from "fs";
import { join } from "path";

const sessionsDir = ".claude/tenax/sessions";
const files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));

for (const file of files.slice(-3)) {
  const path = join(sessionsDir, file);
  console.log(`\n=== ${file} ===`);

  const transcript = await parseTranscript(path);

  console.log(`User messages: ${transcript.userMessages.length}`);
  console.log(`Assistant messages: ${transcript.assistantMessages.length}`);
  console.log(`Tool calls: ${transcript.toolCalls.length}`);

  // Show first few user messages (skipping command ones)
  console.log("\nFirst meaningful user messages:");
  for (const msg of transcript.userMessages.slice(0, 5)) {
    const cleaned = msg.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!msg.match(/^<command-/) && cleaned.length >= 10 && !cleaned.startsWith("```") && !cleaned.match(/^\s*[\[{]/)) {
      console.log(`  - ${cleaned.substring(0, 100)}...`);
    }
  }

  // Show edit/write tool calls
  console.log("\nFile actions:");
  for (const call of transcript.toolCalls.slice(0, 10)) {
    if (call.name === "Write" || call.name === "Edit") {
      const filePath = (call.input.file_path || call.input.path) as string;
      const filename = filePath?.split(/[/\\]/).pop();
      console.log(`  - ${call.name}: ${filename}`);
    }
  }

  // Generate and show summary
  const summary = generateSummary(transcript);
  console.log(`\nGenerated summary: "${summary}"`);
}
