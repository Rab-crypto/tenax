/**
 * Knowledge extractor using heuristic pattern matching
 * Extracts decisions, patterns, tasks, and insights from transcript text
 */

import type { Decision, Pattern, Task, Insight } from "./types";
import { generateId } from "./storage";
import type { ParsedTranscript } from "./transcript-parser";

// ============================================
// DECISION EXTRACTION
// ============================================

const DECISION_PATTERNS = [
  // Explicit decision language
  /(?:we(?:'ve)?|I(?:'ve)?|let's|decided to|choosing|chose|going with|will use|using|picked|selected|opted for|settling on)\s+([^.!?\n]+)/gi,
  // Comparative decisions
  /(?:instead of|rather than|over|prefer)\s+\w+[^.!?\n]*,?\s*(?:we(?:'ll)?|I(?:'ll)?|let's)\s+([^.!?\n]+)/gi,
  // Confirmation language
  /(?:sounds good|agreed|perfect|yes,?\s+let's|confirmed)[^.!?\n]*([^.!?\n]+)/gi,
];

const DECISION_TOPICS = [
  { pattern: /\b(architecture|structure|organization|layout)\b/i, topic: "architecture" },
  { pattern: /\b(state\s*management|redux|zustand|context|store)\b/i, topic: "state-management" },
  { pattern: /\b(database|db|postgres|mysql|mongo|prisma|drizzle)\b/i, topic: "database" },
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

/**
 * Extract decisions from transcript
 */
export function extractDecisions(
  transcript: ParsedTranscript,
  sessionId: string
): Decision[] {
  const decisions: Decision[] = [];
  const seenContent = new Set<string>();

  // Look through assistant messages for decision language
  for (const message of transcript.assistantMessages) {
    for (const pattern of DECISION_PATTERNS) {
      const matches = message.matchAll(pattern);
      for (const match of matches) {
        const decisionText = match[1]?.trim();
        if (!decisionText || decisionText.length < 10 || decisionText.length > 500) {
          continue;
        }

        // Skip if we've seen similar content
        const normalized = decisionText.toLowerCase().replace(/\s+/g, " ");
        if (seenContent.has(normalized)) {
          continue;
        }
        seenContent.add(normalized);

        // Determine topic
        const topic = detectTopic(decisionText + " " + match[0]);

        decisions.push({
          id: generateId(),
          topic,
          decision: decisionText,
          rationale: extractRationale(message, match.index || 0),
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return decisions;
}

/**
 * Detect topic from text
 */
function detectTopic(text: string): string {
  for (const { pattern, topic } of DECISION_TOPICS) {
    if (pattern.test(text)) {
      return topic;
    }
  }
  return "general";
}

/**
 * Extract rationale from surrounding context
 */
function extractRationale(text: string, decisionIndex: number): string {
  // Look for "because", "since", "due to", "as it" patterns near the decision
  const context = text.slice(Math.max(0, decisionIndex - 200), decisionIndex + 300);

  const rationalePatterns = [
    /because\s+([^.!?\n]+)/i,
    /since\s+([^.!?\n]+)/i,
    /due to\s+([^.!?\n]+)/i,
    /as (?:it|this|they)\s+([^.!?\n]+)/i,
    /this (?:will|allows|enables|provides)\s+([^.!?\n]+)/i,
    /for\s+(?:better|improved|easier)\s+([^.!?\n]+)/i,
  ];

  for (const pattern of rationalePatterns) {
    const match = context.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return "";
}

// ============================================
// PATTERN EXTRACTION
// ============================================

const PATTERN_INDICATORS = [
  /(?:we(?:'ll)?|I(?:'ll)?|let's)\s+(?:always|consistently|follow|use)\s+([^.!?\n]+)/gi,
  /(?:the pattern is|convention is|standard is|rule is)\s+([^.!?\n]+)/gi,
  /(?:for consistency|by convention|as a rule)[^.!?\n]*([^.!?\n]+)/gi,
  /(?:every|all)\s+\w+\s+(?:should|must|will)\s+([^.!?\n]+)/gi,
];

/**
 * Extract patterns from transcript
 */
export function extractPatterns(
  transcript: ParsedTranscript,
  sessionId: string
): Pattern[] {
  const patterns: Pattern[] = [];
  const seenContent = new Set<string>();

  for (const message of transcript.assistantMessages) {
    for (const indicator of PATTERN_INDICATORS) {
      const matches = message.matchAll(indicator);
      for (const match of matches) {
        const patternText = match[1]?.trim();
        if (!patternText || patternText.length < 10 || patternText.length > 300) {
          continue;
        }

        const normalized = patternText.toLowerCase().replace(/\s+/g, " ");
        if (seenContent.has(normalized)) {
          continue;
        }
        seenContent.add(normalized);

        patterns.push({
          id: generateId(),
          name: generatePatternName(patternText),
          description: patternText,
          usage: extractUsage(message, match.index || 0),
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return patterns;
}

/**
 * Generate a short name for a pattern
 */
function generatePatternName(description: string): string {
  // Extract key words for naming
  const words = description.split(/\s+/).slice(0, 4);
  return words
    .map((w) => w.replace(/[^a-zA-Z]/g, ""))
    .filter((w) => w.length > 2)
    .join(" ")
    .substring(0, 50);
}

/**
 * Extract usage context
 */
function extractUsage(text: string, patternIndex: number): string {
  const context = text.slice(Math.max(0, patternIndex - 100), patternIndex + 200);

  const usagePatterns = [
    /when\s+([^.!?\n]+)/i,
    /for\s+([^.!?\n]+)/i,
    /in\s+(?:order to|cases where)\s+([^.!?\n]+)/i,
  ];

  for (const pattern of usagePatterns) {
    const match = context.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return "";
}

// ============================================
// TASK EXTRACTION
// ============================================

const TASK_PATTERNS = [
  /(?:todo|TODO|FIXME|HACK|XXX)[:.]?\s*([^.!?\n]+)/g,
  /(?:we need to|need to|should|must|have to)\s+([^.!?\n]+)/gi,
  /(?:next,?\s+(?:we(?:'ll)?|I(?:'ll)?)|after that,?\s+(?:we(?:'ll)?|I(?:'ll)?))\s+([^.!?\n]+)/gi,
  /(?:remaining|left to do|still need)[^.!?\n]*([^.!?\n]+)/gi,
];

/**
 * Extract tasks from transcript
 */
export function extractTasks(
  transcript: ParsedTranscript,
  sessionId: string
): Task[] {
  const tasks: Task[] = [];
  const seenContent = new Set<string>();

  const allText = transcript.fullText;

  for (const pattern of TASK_PATTERNS) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const taskText = match[1]?.trim();
      if (!taskText || taskText.length < 5 || taskText.length > 200) {
        continue;
      }

      // Skip common false positives
      if (
        /^(that|this|it|they|we|I)\s/i.test(taskText) ||
        /^(be|have|do|can|will|would|should|could)\s/i.test(taskText)
      ) {
        continue;
      }

      const normalized = taskText.toLowerCase().replace(/\s+/g, " ");
      if (seenContent.has(normalized)) {
        continue;
      }
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

  return tasks;
}

// ============================================
// INSIGHT EXTRACTION
// ============================================

const INSIGHT_PATTERNS = [
  /(?:interesting(?:ly)?|notable|important(?:ly)?|key point|worth noting)[^.!?\n]*([^.!?\n]+)/gi,
  /(?:learned|discovered|realized|found out)\s+(?:that\s+)?([^.!?\n]+)/gi,
  /(?:turns out|apparently|surprisingly)[^.!?\n]*([^.!?\n]+)/gi,
];

/**
 * Extract insights from transcript
 */
export function extractInsights(
  transcript: ParsedTranscript,
  sessionId: string
): Insight[] {
  const insights: Insight[] = [];
  const seenContent = new Set<string>();

  const allText = transcript.fullText;

  for (const pattern of INSIGHT_PATTERNS) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const insightText = match[1]?.trim();
      if (!insightText || insightText.length < 10 || insightText.length > 300) {
        continue;
      }

      const normalized = insightText.toLowerCase().replace(/\s+/g, " ");
      if (seenContent.has(normalized)) {
        continue;
      }
      seenContent.add(normalized);

      insights.push({
        id: generateId(),
        content: insightText,
        sessionId,
        timestamp: new Date().toISOString(),
      });
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
  // Use first user message as base
  const firstMessage = transcript.userMessages[0] || "";

  // Get key actions from tool calls
  const actions: string[] = [];
  for (const call of transcript.toolCalls) {
    if (call.name === "Write") {
      const path = call.input.file_path as string;
      if (path) {
        actions.push(`Created ${path.split("/").pop()}`);
      }
    } else if (call.name === "Edit") {
      const path = call.input.file_path as string;
      if (path) {
        actions.push(`Modified ${path.split("/").pop()}`);
      }
    }
  }

  // Build summary
  let summary = firstMessage.substring(0, 200);

  if (actions.length > 0) {
    const uniqueActions = [...new Set(actions)].slice(0, 5);
    summary += `. Actions: ${uniqueActions.join(", ")}`;
  }

  return summary;
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
export function extractAllKnowledge(
  transcript: ParsedTranscript,
  sessionId: string
): ExtractedKnowledge {
  return {
    decisions: extractDecisions(transcript, sessionId),
    patterns: extractPatterns(transcript, sessionId),
    tasks: extractTasks(transcript, sessionId),
    insights: extractInsights(transcript, sessionId),
    summary: generateSummary(transcript),
    keyTopics: extractKeyTopics(transcript),
  };
}

/**
 * Extract key topics from transcript
 */
function extractKeyTopics(transcript: ParsedTranscript): string[] {
  const topics = new Set<string>();

  const fullText = transcript.fullText.toLowerCase();

  for (const { pattern, topic } of DECISION_TOPICS) {
    if (pattern.test(fullText)) {
      topics.add(topic);
    }
  }

  return Array.from(topics);
}
