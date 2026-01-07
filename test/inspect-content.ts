#!/usr/bin/env bun

/**
 * Inspect actual transcript content to understand the patterns
 */

import { readFileSync } from "fs";

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: { type?: string }) => block.type === "text")
      .map((block: { text?: string }) => block.text || "")
      .join("\n");
  }
  return "";
}

const lines = readFileSync(".claude/tenax/sessions/002.jsonl", "utf-8").split("\n");

let count = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const entry = JSON.parse(line);
    if (entry.type === "assistant" && entry.message?.content) {
      const text = extractText(entry.message.content);
      if (!text.trim()) continue;

      console.log("=== Assistant Message ===");
      console.log(text.slice(0, 1000));
      console.log();

      count++;
      if (count >= 5) break;
    }
  } catch (e) {}
}
