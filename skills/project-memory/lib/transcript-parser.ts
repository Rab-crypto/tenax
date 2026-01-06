/**
 * Transcript parser for Claude Code session JSONL files
 * Parses the transcript format and extracts structured data
 */

import type { TranscriptEntry, TranscriptMessage, TranscriptToolUse, TranscriptToolResult } from "./types";

export interface ParsedTranscript {
  entries: TranscriptEntry[];
  userMessages: string[];
  assistantMessages: string[];
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: string;
  }>;
  fullText: string;
}

/**
 * Parse a JSONL transcript file
 */
export async function parseTranscript(path: string): Promise<ParsedTranscript> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return {
      entries: [],
      userMessages: [],
      assistantMessages: [],
      toolCalls: [],
      fullText: "",
    };
  }

  const text = await file.text();
  return parseTranscriptText(text);
}

/**
 * Parse transcript from text content
 */
export function parseTranscriptText(text: string): ParsedTranscript {
  const lines = text.split("\n").filter((line) => line.trim());
  const entries: TranscriptEntry[] = [];
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];
  const toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: string;
  }> = [];

  const fullTextParts: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      entries.push(entry);

      // Extract based on entry type
      if (entry.type === "user" || entry.role === "user") {
        const content = extractContent(entry);
        if (content) {
          userMessages.push(content);
          fullTextParts.push(`User: ${content}`);
        }
      } else if (entry.type === "assistant" || entry.role === "assistant") {
        const content = extractContent(entry);
        if (content) {
          assistantMessages.push(content);
          fullTextParts.push(`Assistant: ${content}`);
        }
      } else if (entry.type === "tool_use") {
        toolCalls.push({
          name: entry.tool_name || entry.name,
          input: entry.tool_input || entry.input || {},
        });
      } else if (entry.type === "tool_result") {
        // Match result to corresponding tool call
        const lastCall = toolCalls[toolCalls.length - 1];
        if (lastCall && !lastCall.result) {
          lastCall.result = extractContent(entry);
        }
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return {
    entries,
    userMessages,
    assistantMessages,
    toolCalls,
    fullText: fullTextParts.join("\n\n"),
  };
}

/**
 * Extract text content from various entry formats
 */
function extractContent(entry: Record<string, unknown>): string {
  // Direct content field (string)
  if (typeof entry.content === "string") {
    return entry.content;
  }

  // Direct content array (common in Claude API responses)
  if (Array.isArray(entry.content)) {
    return extractTextFromContentArray(entry.content);
  }

  // Nested message object (Claude Code transcript format)
  // Structure: { message: { content: [...] } }
  if (entry.message && typeof entry.message === "object") {
    const message = entry.message as Record<string, unknown>;

    // Check message.content (string)
    if (typeof message.content === "string") {
      return message.content;
    }

    // Check message.content (array)
    if (Array.isArray(message.content)) {
      return extractTextFromContentArray(message.content);
    }
  }

  // Text field
  if (typeof entry.text === "string") {
    return entry.text;
  }

  return "";
}

/**
 * Extract text from a content array (handles text, tool_use, tool_result blocks)
 */
function extractTextFromContentArray(content: unknown[]): string {
  const textParts: string[] = [];

  for (const item of content) {
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;

      // Text blocks
      if (obj.type === "text" && typeof obj.text === "string") {
        textParts.push(obj.text);
      }

      // Tool result blocks (extract the content)
      if (obj.type === "tool_result") {
        if (typeof obj.content === "string") {
          textParts.push(obj.content);
        } else if (Array.isArray(obj.content)) {
          // Nested content array in tool result
          for (const nested of obj.content) {
            if (typeof nested === "object" && nested !== null) {
              const nestedObj = nested as Record<string, unknown>;
              if (nestedObj.type === "text" && typeof nestedObj.text === "string") {
                textParts.push(nestedObj.text);
              }
            }
          }
        }
      }
    }
  }

  return textParts.join("\n");
}

/**
 * Get the first user message (often used as summary seed)
 */
export function getFirstUserMessage(transcript: ParsedTranscript): string {
  return transcript.userMessages[0] || "";
}

/**
 * Get file paths from tool calls
 */
export function getModifiedFiles(transcript: ParsedTranscript): string[] {
  const files = new Set<string>();

  for (const call of transcript.toolCalls) {
    if (["Write", "Edit", "MultiEdit"].includes(call.name)) {
      const filePath = call.input.file_path || call.input.path;
      if (typeof filePath === "string") {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}

/**
 * Count tokens in transcript (approximate)
 */
export function countTranscriptTokens(transcript: ParsedTranscript): number {
  // Rough estimate: 4 characters per token
  return Math.ceil(transcript.fullText.length / 4);
}

/**
 * Extract topics from transcript text
 */
export function extractTopics(transcript: ParsedTranscript): string[] {
  const topics = new Set<string>();

  // Common technical topics to look for
  const topicPatterns = [
    /\b(api|endpoint|route|controller)\b/gi,
    /\b(database|db|sql|postgres|mysql|mongo)\b/gi,
    /\b(auth|authentication|authorization|login|jwt|oauth)\b/gi,
    /\b(test|testing|jest|vitest|mocha)\b/gi,
    /\b(component|react|vue|angular|svelte)\b/gi,
    /\b(style|css|scss|tailwind|styled)\b/gi,
    /\b(state|redux|zustand|context|store)\b/gi,
    /\b(type|typescript|interface|schema)\b/gi,
    /\b(config|configuration|settings|env)\b/gi,
    /\b(deploy|ci|cd|docker|kubernetes)\b/gi,
    /\b(error|exception|handling|validation)\b/gi,
    /\b(cache|caching|redis|memcached)\b/gi,
    /\b(websocket|socket|realtime|sse)\b/gi,
    /\b(file|upload|storage|s3|blob)\b/gi,
    /\b(email|notification|messaging)\b/gi,
  ];

  const fullText = transcript.fullText.toLowerCase();

  for (const pattern of topicPatterns) {
    const matches = fullText.match(pattern);
    if (matches && matches.length >= 2) {
      // Topic mentioned multiple times
      topics.add(matches[0].toLowerCase());
    }
  }

  return Array.from(topics);
}
