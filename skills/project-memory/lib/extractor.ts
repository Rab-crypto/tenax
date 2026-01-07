/**
 * Knowledge extractor - marker-based extraction only
 * Extracts decisions, patterns, tasks, and insights from transcript text using [D], [P], [T], [I] markers
 */

import type { Decision, Pattern, Task, Insight } from "./types";
import { generateId } from "./storage";
import type { ParsedTranscript } from "./transcript-parser";

// ============================================
// SYSTEM CONTENT BLOCKLIST
// ============================================

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
  /you should|you must|you can not|please ensure/i,
  /when.*user.*asks/i,
  /IMPORTANT:/i,
  /^\s*\d+→/,
];

/**
 * Check if text appears to be system/tool content
 */
function isSystemContent(text: string): boolean {
  return SYSTEM_BLOCKLIST.some((pattern) => pattern.test(text));
}

/**
 * Filter messages to remove system content before extraction
 */
function filterExtractableMessages(messages: string[]): string[] {
  return messages
    .filter((msg) => !isSystemContent(msg))
    .map((msg) => {
      let cleaned = msg
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
        .replace(/<function_results>[\s\S]*?<\/function_results>/gi, "");

      // Remove code blocks - these often contain marker examples
      cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

      // Remove inline code - prevents matching markers in explanations
      cleaned = cleaned.replace(/`[^`]+`/g, "");

      return cleaned.trim();
    })
    .filter((msg) => msg.length > 0);
}

/**
 * Check if extracted content looks like documentation/example
 */
function isDocumentationContent(text: string): boolean {
  const docPatterns = [
    /marker\s+(about|was|for|is|are|isn't|weren't|that)/i,
    /the\s+\[?(DECISION|PATTERN|TASK|INSIGHT)/i,
    /earlier\s+\[?(DECISION|PATTERN|TASK|INSIGHT)/i,
    /no\s+(new\s+)?\[?(DECISION|PATTERN|TASK|INSIGHT)/i,
    /^\s*`/,
    /`\s*$/,
    /^\s*\.\.\./,
    /\.\.\.\s*$/,
    /\[\/?(DECISION|PATTERN|TASK|INSIGHT)[:\s]*\]/i,
    /example:/i,
    /template:/i,
    /e\.g\.,?\s*\[/i,
    /for instance.*\[/i,
    /extractor?\s+(captured|grabbed|found|matched|picked)/i,
    /extraction\s+(captured|grabbed|found|matched|picked)/i,
    /was(n't)?\s+(captured|extracted|marked)/i,
  ];

  return docPatterns.some((pattern) => pattern.test(text));
}

// ============================================
// TOPIC DETECTION
// ============================================

const DECISION_TOPICS = [
  { pattern: /\b(architecture|structure|organization|layout)\b/i, topic: "architecture" },
  { pattern: /\b(state\s*management|redux|zustand|context|store)\b/i, topic: "state-management" },
  { pattern: /\b(database|db|postgres|mysql|mongo|prisma|drizzle|sqlite)\b/i, topic: "database" },
  { pattern: /\b(api|rest|graphql|endpoint|route)\b/i, topic: "api" },
  { pattern: /\b(auth|authentication|login|jwt|oauth|session)\b/i, topic: "authentication" },
  { pattern: /\b(test|testing|jest|vitest|cypress)\b/i, topic: "testing" },
  { pattern: /\b(style|css|tailwind|scss|styled)\b/i, topic: "styling" },
  { pattern: /\b(deploy|hosting|vercel|aws|docker)\b/i, topic: "deployment" },
  { pattern: /\b(lint|format|eslint|prettier|biome)\b/i, topic: "code-quality" },
  { pattern: /\b(type|typescript|interface|schema|zod)\b/i, topic: "typing" },
  { pattern: /\b(component|react|vue|angular|svelte)\b/i, topic: "components" },
  { pattern: /\b(package|dependency|library|npm|bun)\b/i, topic: "dependencies" },
  { pattern: /\b(error|exception|handling|validation)\b/i, topic: "error-handling" },
  { pattern: /\b(cache|caching|memoization)\b/i, topic: "caching" },
  { pattern: /\b(file|folder|directory|naming)\b/i, topic: "file-organization" },
];

function detectTopic(text: string): string {
  for (const { pattern, topic } of DECISION_TOPICS) {
    if (pattern.test(text)) {
      return topic;
    }
  }
  return "general";
}

// ============================================
// MARKER-BASED EXTRACTION
// ============================================

// Single-line format: [D] topic: text (no newlines allowed - use [ \t]* instead of \s*)
const DECISION_MARKER_SINGLE = /^\[D\][ \t]*([^:\n]+):[ \t]*(.+)$/gim;
const PATTERN_MARKER_SINGLE = /^\[P\][ \t]*([^:\n]+):[ \t]*(.+)$/gim;
const TASK_MARKER_SINGLE = /^\[T\][ \t]*(.+)$/gim;
const INSIGHT_MARKER_SINGLE = /^\[I\][ \t]*(.+)$/gim;

interface MultiLineBlock {
  type: "D" | "P" | "T" | "I";
  content: string;
}

/**
 * Extract multi-line blocks that start with [D], [P], [T], or [I]
 * and continue until a blank line or next marker
 */
function extractMultiLineBlocks(text: string): MultiLineBlock[] {
  const blocks: MultiLineBlock[] = [];
  const lines = text.split("\n");

  let currentBlock: MultiLineBlock | null = null;
  let blockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for marker start: [D], [P], [T], [I] at line beginning
    const markerMatch = trimmed.match(/^\[(D|P|T|I)\]\s*(.*)$/i);

    if (markerMatch) {
      // Save previous block if exists
      if (currentBlock && blockLines.length > 0) {
        currentBlock.content = blockLines.join("\n").trim();
        if (currentBlock.content.length >= 10) {
          blocks.push(currentBlock);
        }
      }

      const markerType = markerMatch[1]!.toUpperCase() as "D" | "P" | "T" | "I";
      const restOfLine = markerMatch[2] || "";

      // Check if this is single-line format: [D] topic: text
      const singleLineMatch = restOfLine.match(/^([^:\s][^:]*?):\s+(.+)$/);

      if (singleLineMatch && !restOfLine.includes("\n")) {
        // Single-line format, skip (handled by single-line regex)
        currentBlock = null;
        blockLines = [];
        continue;
      }

      // Start new multi-line block
      currentBlock = { type: markerType, content: "" };
      blockLines = restOfLine ? [restOfLine] : [];
      continue;
    }

    // If we're in a block
    if (currentBlock) {
      // Blank line ends the block
      if (trimmed === "") {
        currentBlock.content = blockLines.join("\n").trim();
        if (currentBlock.content.length >= 10) {
          blocks.push(currentBlock);
        }
        currentBlock = null;
        blockLines = [];
        continue;
      }

      // Add line to current block
      blockLines.push(line);
    }
  }

  // Don't forget the last block
  if (currentBlock && blockLines.length > 0) {
    currentBlock.content = blockLines.join("\n").trim();
    if (currentBlock.content.length >= 10) {
      blocks.push(currentBlock);
    }
  }

  return blocks;
}

/**
 * Generate a short name for a pattern from its description
 */
function generatePatternName(description: string): string {
  const skipWords = new Set(["the", "a", "an", "to", "for", "with", "use", "we", "i", "will", "should"]);
  const words = description
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase())
    .filter((w) => w.length > 2 && !skipWords.has(w))
    .slice(0, 4);

  return words.join("-").substring(0, 50) || "pattern";
}

// ============================================
// EXTRACTION FUNCTIONS
// ============================================

/**
 * Extract decisions from transcript using [D] markers only
 */
export async function extractDecisions(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Decision[]> {
  const decisions: Decision[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // Extract multi-line blocks first
  const multiLineBlocks = extractMultiLineBlocks(fullText);
  for (const block of multiLineBlocks) {
    if (block.type !== "D") continue;

    const decisionText = block.content;
    if (isDocumentationContent(decisionText)) continue;

    if (decisionText.length >= 10 && decisionText.length <= 2000) {
      const normalized = decisionText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        decisions.push({
          id: generateId(),
          topic: detectTopic(decisionText),
          decision: decisionText,
          rationale: "",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Extract single-line markers: [D] topic: text
  const markerRegex = new RegExp(DECISION_MARKER_SINGLE.source, "gim");
  let match;
  while ((match = markerRegex.exec(fullText)) !== null) {
    const topic = (match[1] || "general").trim().toLowerCase();
    const decisionText = (match[2] || "").trim();

    if (isDocumentationContent(decisionText)) continue;

    if (decisionText.length >= 10 && decisionText.length <= 500) {
      const normalized = decisionText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        decisions.push({
          id: generateId(),
          topic,
          decision: decisionText,
          rationale: "",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return decisions;
}

/**
 * Extract patterns from transcript using [P] markers only
 */
export async function extractPatterns(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Pattern[]> {
  const patterns: Pattern[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // Extract multi-line blocks first
  const multiLineBlocks = extractMultiLineBlocks(fullText);
  for (const block of multiLineBlocks) {
    if (block.type !== "P") continue;

    const description = block.content;
    if (isDocumentationContent(description)) continue;

    if (description.length >= 10 && description.length <= 2000) {
      const normalized = description.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        patterns.push({
          id: generateId(),
          name: generatePatternName(description),
          description,
          usage: "",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Extract single-line markers: [P] name: description
  const markerRegex = new RegExp(PATTERN_MARKER_SINGLE.source, "gim");
  let match;
  while ((match = markerRegex.exec(fullText)) !== null) {
    const name = (match[1] || "pattern").trim().toLowerCase();
    const description = (match[2] || "").trim();

    if (isDocumentationContent(description) || isDocumentationContent(name)) continue;

    if (description.length >= 10 && description.length <= 500) {
      const normalized = description.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        patterns.push({
          id: generateId(),
          name,
          description,
          usage: "",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return patterns;
}

/**
 * Extract tasks from transcript using [T] markers only
 */
export async function extractTasks(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Task[]> {
  const tasks: Task[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // Extract multi-line blocks first
  const multiLineBlocks = extractMultiLineBlocks(fullText);
  for (const block of multiLineBlocks) {
    if (block.type !== "T") continue;

    const taskText = block.content;
    if (isDocumentationContent(taskText)) continue;

    if (taskText.length >= 10 && taskText.length <= 2000) {
      const normalized = taskText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        tasks.push({
          id: generateId(),
          title: taskText.split("\n")[0]?.substring(0, 100) || taskText.substring(0, 100),
          description: taskText,
          status: "pending",
          sessionCreated: sessionId,
          timestampCreated: new Date().toISOString(),
        });
      }
    }
  }

  // Extract single-line markers: [T] task description
  const markerRegex = new RegExp(TASK_MARKER_SINGLE.source, "gim");
  let match;
  while ((match = markerRegex.exec(fullText)) !== null) {
    const taskText = (match[1] || "").trim();

    if (isDocumentationContent(taskText)) continue;

    if (taskText.length >= 10 && taskText.length <= 500) {
      const normalized = taskText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        tasks.push({
          id: generateId(),
          title: taskText.substring(0, 100),
          description: taskText.length > 100 ? taskText : undefined,
          status: "pending",
          sessionCreated: sessionId,
          timestampCreated: new Date().toISOString(),
        });
      }
    }
  }

  return tasks;
}

/**
 * Extract insights from transcript using [I] markers only
 */
export async function extractInsights(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Insight[]> {
  const insights: Insight[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // Extract multi-line blocks first
  const multiLineBlocks = extractMultiLineBlocks(fullText);
  for (const block of multiLineBlocks) {
    if (block.type !== "I") continue;

    const insightText = block.content;
    if (isDocumentationContent(insightText)) continue;

    if (insightText.length >= 10 && insightText.length <= 2000) {
      const normalized = insightText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        insights.push({
          id: generateId(),
          content: insightText,
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Extract single-line markers: [I] insight text
  const markerRegex = new RegExp(INSIGHT_MARKER_SINGLE.source, "gim");
  let match;
  while ((match = markerRegex.exec(fullText)) !== null) {
    const insightText = (match[1] || "").trim();

    if (isDocumentationContent(insightText)) continue;

    if (insightText.length >= 10 && insightText.length <= 500) {
      const normalized = insightText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        insights.push({
          id: generateId(),
          content: insightText,
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return insights;
}

// ============================================
// SUMMARY GENERATION
// ============================================

/**
 * Generate a summary from transcript content
 */
export function generateSummary(transcript: ParsedTranscript): string {
  const summaryParts: string[] = [];

  // Find meaningful user requests
  const meaningfulUserMessages: string[] = [];
  for (const msg of transcript.userMessages) {
    if (msg.match(/^<command-/)) continue;
    if (msg.startsWith("# /")) continue;
    if (isSystemContent(msg)) continue;

    const cleaned = msg
      .replace(/<[^>]+>/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 15) continue;
    if (cleaned.match(/^\s*[\[{]/) || cleaned.match(/^[0-9]+→/)) continue;
    if (cleaned.match(/^[A-Z]:\\|^\/[a-z]/i)) continue;
    if (cleaned.match(/^[MADRCU?!]\s+/)) continue;

    meaningfulUserMessages.push(cleaned);
  }

  if (meaningfulUserMessages.length > 0 && meaningfulUserMessages[0]) {
    summaryParts.push(meaningfulUserMessages[0].substring(0, 150));
  }

  // Get key actions from tool calls
  const fileActions: string[] = [];
  for (const call of transcript.toolCalls) {
    if (call.name === "Write") {
      const path = call.input.file_path as string;
      if (path) {
        const filename = path.split(/[/\\]/).pop();
        if (filename && !filename.startsWith(".")) {
          fileActions.push(`Created ${filename}`);
        }
      }
    } else if (call.name === "Edit") {
      const path = call.input.file_path as string;
      if (path) {
        const filename = path.split(/[/\\]/).pop();
        if (filename && !filename.startsWith(".")) {
          fileActions.push(`Modified ${filename}`);
        }
      }
    }
  }

  if (fileActions.length > 0) {
    const uniqueActions = [...new Set(fileActions)].slice(0, 5);
    summaryParts.push(`Files: ${uniqueActions.join(", ")}`);
  }

  const summary = summaryParts.join(". ").substring(0, 400);
  return summary || "Session with no captured summary";
}

// ============================================
// COMBINED EXTRACTION
// ============================================

export interface ExtractedKnowledge {
  decisions: Decision[];
  patterns: Pattern[];
  tasks: Task[];
  insights: Insight[];
  summary: string;
  keyTopics: string[];
}

/**
 * Extract all knowledge from a transcript
 */
export async function extractAllKnowledge(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<ExtractedKnowledge> {
  const [decisions, patterns, tasks, insights] = await Promise.all([
    extractDecisions(transcript, sessionId),
    extractPatterns(transcript, sessionId),
    extractTasks(transcript, sessionId),
    extractInsights(transcript, sessionId),
  ]);

  return {
    decisions,
    patterns,
    tasks,
    insights,
    summary: generateSummary(transcript),
    keyTopics: extractKeyTopics(transcript),
  };
}

/**
 * Extract key topics from transcript
 */
function extractKeyTopics(transcript: ParsedTranscript): string[] {
  const topics = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join(" ").toLowerCase();

  for (const { pattern, topic } of DECISION_TOPICS) {
    if (pattern.test(fullText)) {
      topics.add(topic);
    }
  }

  return Array.from(topics);
}
