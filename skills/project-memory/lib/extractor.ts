/**
 * Knowledge extractor using improved pattern matching + embedding-based quality scoring
 * Extracts decisions, patterns, tasks, and insights from transcript text
 */

import type { Decision, Pattern, Task, Insight, TextSegment } from "./types";
import { generateId } from "./storage";
import type { ParsedTranscript } from "./transcript-parser";
import { scoreCandidate } from "./extraction-scorer";

// ============================================
// SYSTEM CONTENT BLOCKLIST
// ============================================

const SYSTEM_BLOCKLIST = [
  // Claude system reminders
  /system-reminder/i,
  /<system-reminder>/i,
  /<\/system-reminder>/i,
  /CRITICAL:.*READ-ONLY/i,
  /malware/i,
  /refuse to improve/i,
  /must not.*edit/i,

  // Function results markers
  /<function_results>/i,
  /<\/function_results>/i,
  /\[Omitted long matching line\]/i,

  // Code/regex patterns (too technical)
  /^\s*\/[^/]+\/[gimsuvy]*[,;]?\s*$/,
  /^\s*const\s+\w+_PATTERNS?\s*=/i,
  /^\s*export\s+(async\s+)?function/,

  // Instructions to Claude
  /you should|you must|you can not|please ensure/i,
  /when.*user.*asks/i,
  /IMPORTANT:/i,

  // Tool output formatting
  /^\s*\d+→/,  // Line number prefixes from Read tool
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
      // Also remove system reminder blocks from within messages
      return msg
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
        .replace(/<function_results>[\s\S]*?<\/function_results>/gi, "")
        .trim();
    })
    .filter((msg) => msg.length > 0);
}

// ============================================
// STRUCTURE-AWARE PARSING
// ============================================

/**
 * Parse text into structural segments (prose, headers, bullets, code)
 */
function parseStructure(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const lines = text.split("\n");

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    // Handle code blocks
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        segments.push({ type: "code", content: codeBlockContent.join("\n") });
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch && headerMatch[1] && headerMatch[2]) {
      segments.push({
        type: "header",
        content: headerMatch[2],
        level: headerMatch[1].length,
      });
      continue;
    }

    // Bullets
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch && bulletMatch[2]) {
      segments.push({
        type: "bullet",
        content: bulletMatch[2],
        level: Math.floor((bulletMatch[1] || "").length / 2),
      });
      continue;
    }

    // Blockquotes
    if (line.startsWith(">")) {
      segments.push({ type: "blockquote", content: line.slice(1).trim() });
      continue;
    }

    // Regular prose
    if (line.trim()) {
      segments.push({ type: "prose", content: line.trim() });
    }
  }

  return segments;
}

/**
 * Get extractable text from segments (skip code blocks)
 */
function getExtractableText(segments: TextSegment[]): string {
  return segments
    .filter((s) => s.type === "prose" || s.type === "bullet")
    .map((s) => s.content)
    .join(" ");
}

// ============================================
// SENTENCE BOUNDARY DETECTION
// ============================================

/**
 * Extract complete sentences from text, handling:
 * - Abbreviations (e.g., i.e., etc.)
 * - Code references (fs.mkdir, foo.bar())
 * - Version numbers (v1.0, 2.5.0)
 */
function extractSentences(text: string): string[] {
  // Protect common patterns that contain periods
  const protections: Map<string, string> = new Map();
  let protectionIndex = 0;

  const protectedPatterns: RegExp[] = [
    /\b(e\.g\.|i\.e\.|vs\.|etc\.|et al\.|Mr\.|Mrs\.|Dr\.|Sr\.|Jr\.)/gi,
    /\b(\d+\.\d+(\.\d+)?)/g, // Version numbers
    /\b([a-zA-Z_]\w*\.[a-zA-Z_]\w*(\([^)]*\))?)/g, // Code refs like fs.mkdir()
    /(https?:\/\/[^\s]+)/g, // URLs
    /`[^`]+`/g, // Inline code
  ];

  let processed = text;
  for (const pattern of protectedPatterns) {
    processed = processed.replace(pattern, (match) => {
      const placeholder = `__PROT${protectionIndex++}__`;
      protections.set(placeholder, match);
      return placeholder;
    });
  }

  // Split on sentence boundaries (. ! ? followed by space and capital or end)
  const sentences: string[] = [];
  const sentencePattern = /[^.!?]+[.!?]+(?=\s+[A-Z]|\s*$)|[^.!?]+$/g;
  const matches = processed.match(sentencePattern);

  if (matches) {
    for (const sentence of matches) {
      let restored = sentence;
      for (const [placeholder, original] of protections) {
        restored = restored.replace(placeholder, original);
      }
      const trimmed = restored.trim();
      if (trimmed.length > 0) {
        sentences.push(trimmed);
      }
    }
  }

  return sentences;
}

/**
 * Find the complete sentence containing a match
 */
function findContainingSentence(text: string, matchIndex: number): string {
  const sentences = extractSentences(text);

  let currentPos = 0;
  for (const sentence of sentences) {
    const sentenceStart = text.indexOf(sentence, currentPos);
    const sentenceEnd = sentenceStart + sentence.length;

    if (matchIndex >= sentenceStart && matchIndex < sentenceEnd) {
      return sentence;
    }
    currentPos = sentenceEnd;
  }

  // Fallback: return text around the match
  const start = Math.max(0, text.lastIndexOf(".", matchIndex - 1) + 1);
  const end = text.indexOf(".", matchIndex);
  return text.slice(start, end > matchIndex ? end + 1 : matchIndex + 100).trim();
}

// ============================================
// DECISION EXTRACTION
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

// ============================================
// MARKER-BASED EXTRACTION (HIGHEST PRIORITY)
// ============================================

// Single-line markers: [DECISION: topic] text (must not end with : which indicates multi-line)
const DECISION_MARKER_SINGLE = /\[DECISION:\s*([^\]]+)\]\s*(.+[^:\s])$/gim;
const PATTERN_MARKER_SINGLE = /\[PATTERN:\s*([^\]]+)\]\s*(.+[^:\s])$/gim;
const TASK_MARKER_SINGLE = /\[TASK:\s*([^\]]+)\]\s*(.+[^:\s])$/gim;
const INSIGHT_MARKER_SINGLE = /\[INSIGHT\]\s*(.+[^:\s])$/gim;

// Multi-line markers: [DECISION: topic]...[/]
const DECISION_MARKER_MULTI = /\[DECISION:\s*([^\]]+)\]\s*\n([\s\S]*?)\[\/\]/gi;
const PATTERN_MARKER_MULTI = /\[PATTERN:\s*([^\]]+)\]\s*\n([\s\S]*?)\[\/\]/gi;
const TASK_MARKER_MULTI = /\[TASK:\s*([^\]]+)\]\s*\n([\s\S]*?)\[\/\]/gi;
const INSIGHT_MARKER_MULTI = /\[INSIGHT\]\s*\n([\s\S]*?)\[\/\]/gi;

// ============================================
// FALLBACK PATTERNS (LOWER PRIORITY)
// ============================================

// Patterns for conversational decisions
const CONVERSATIONAL_TRIGGERS = [
  /\b(we(?:'ve)?|I(?:'ve)?|the team)\s+(decided|chose|selected|opted|went with|will use|are using)/i,
  /\b(going with|choosing|using|picking|selecting)\s+\w+/i,
  /\b(decided to|chose to|opted to|going to use)\b/i,
  /\bfor\s+\w+[^,]*,\s*(we|I)(?:'ll)?\s+(use|implement|go with)/i,
];

// Patterns for structured/action-based content (more common in summaries)
const ACTION_TRIGGERS = [
  /\b(updated?|changed?|switched|migrated|converted)\s+/i,
  /\b(added|implemented|created|built|introduced)\s+/i,
  /\b(replaced|removed|deprecated)\s+/i,
  /\b(fixed|resolved|addressed)\s+/i,
  /\b(using|uses?)\s+\w+\s+(for|to|with|instead)/i,
];

// Pattern for structured bullet decisions like "- **[topic]** decision text"
const STRUCTURED_DECISION_PATTERN = /^\*\*\[([^\]]+)\]\*\*\s+(.+)$/;

/**
 * Extract decisions from transcript (async for embedding scoring)
 */
export async function extractDecisions(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Decision[]> {
  const decisions: Decision[] = [];
  const seenContent = new Set<string>();

  // Pre-filter messages
  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // PHASE 1a: Extract from multi-line markers [DECISION: topic]...[/]
  const multiRegex = new RegExp(DECISION_MARKER_MULTI.source, "gi");
  let multiMatch;
  while ((multiMatch = multiRegex.exec(fullText)) !== null) {
    const topic = (multiMatch[1] || "general").trim().toLowerCase();
    const decisionText = (multiMatch[2] || "").trim();

    if (decisionText.length >= 10 && decisionText.length <= 2000) {
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

  // PHASE 1b: Extract from single-line markers [DECISION: topic] text
  const singleRegex = new RegExp(DECISION_MARKER_SINGLE.source, "gim");
  let singleMatch;
  while ((singleMatch = singleRegex.exec(fullText)) !== null) {
    const topic = (singleMatch[1] || "general").trim().toLowerCase();
    const decisionText = (singleMatch[2] || "").trim();

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

  // PHASE 2: Check bullet points for legacy structured decisions
  for (const message of extractableMessages) {
    const segments = parseStructure(message);
    const bullets = segments.filter((s) => s.type === "bullet");

    for (const bullet of bullets) {
      const content = bullet.content;

      // Check for structured format: **[topic]** decision text
      const structuredMatch = content.match(STRUCTURED_DECISION_PATTERN);
      if (structuredMatch) {
        const topic = structuredMatch[1] || "general";
        const decisionText = structuredMatch[2] || "";

        if (decisionText.length >= 15 && decisionText.length <= 500) {
          const normalized = decisionText.toLowerCase().replace(/\s+/g, " ").trim();
          if (!seenContent.has(normalized)) {
            const hasContent = /[a-zA-Z]{3,}/.test(decisionText);
            if (hasContent) {
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
        continue;
      }

      // Check for action-based bullets (Updated X, Replaced Y, etc.)
      for (const trigger of ACTION_TRIGGERS) {
        if (trigger.test(content)) {
          const cleaned = content
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .trim();

          if (cleaned.length >= 20 && cleaned.length <= 500) {
            const normalized = cleaned.toLowerCase().replace(/\s+/g, " ").trim();
            if (!seenContent.has(normalized)) {
              const quality = await scoreCandidate(cleaned, "decision");
              if (quality.score >= 0.15) {
                seenContent.add(normalized);
                decisions.push({
                  id: generateId(),
                  topic: detectTopic(cleaned),
                  decision: cleaned,
                  rationale: "",
                  sessionId,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
          break;
        }
      }
    }

    // PHASE 3: Check prose for conversational decisions
    const proseText = segments
      .filter((s) => s.type === "prose")
      .map((s) => s.content)
      .join(" ");

    for (const trigger of CONVERSATIONAL_TRIGGERS) {
      let match;
      const regex = new RegExp(trigger.source, trigger.flags + "g");

      while ((match = regex.exec(proseText)) !== null) {
        const fullSentence = findContainingSentence(proseText, match.index);

        if (fullSentence.length < 20 || fullSentence.length > 500) {
          continue;
        }

        const quality = await scoreCandidate(fullSentence, "decision");
        if (!quality.passed) {
          continue;
        }

        const normalized = fullSentence.toLowerCase().replace(/\s+/g, " ").trim();
        if (seenContent.has(normalized)) {
          continue;
        }
        seenContent.add(normalized);

        const rationale = extractRationale(proseText, match.index + fullSentence.length);
        const topic = detectTopic(fullSentence);

        decisions.push({
          id: generateId(),
          topic,
          decision: fullSentence,
          rationale,
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
function extractRationale(text: string, startIndex: number): string {
  const context = text.slice(startIndex, startIndex + 300);
  const sentences = extractSentences(context);

  // Look for rationale in the next 1-2 sentences
  for (const sentence of sentences.slice(0, 2)) {
    if (/\b(because|since|due to|as (it|this|they)|this (will|allows|enables|provides)|for (better|improved|easier))\b/i.test(sentence)) {
      return sentence;
    }
  }

  return "";
}

// ============================================
// PATTERN EXTRACTION
// ============================================

const PATTERN_TRIGGERS = [
  /\b(we|I)(?:'ll)?\s+(always|consistently|follow|use)\s+/i,
  /\b(the pattern is|convention is|standard is|rule is)\b/i,
  /\b(for consistency|by convention|as a rule)\b/i,
  /\b(every|all)\s+\w+\s+(should|must|will)\b/i,
];

/**
 * Extract patterns from transcript
 */
export async function extractPatterns(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Pattern[]> {
  const patterns: Pattern[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // PHASE 1a: Extract from multi-line markers [PATTERN: name]...[/]
  const multiRegex = new RegExp(PATTERN_MARKER_MULTI.source, "gi");
  let multiMatch;
  while ((multiMatch = multiRegex.exec(fullText)) !== null) {
    const name = (multiMatch[1] || "pattern").trim().toLowerCase();
    const description = (multiMatch[2] || "").trim();

    if (description.length >= 10 && description.length <= 2000) {
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

  // PHASE 1b: Extract from single-line markers [PATTERN: name] description
  const singleRegex = new RegExp(PATTERN_MARKER_SINGLE.source, "gim");
  let singleMatch;
  while ((singleMatch = singleRegex.exec(fullText)) !== null) {
    const name = (singleMatch[1] || "pattern").trim().toLowerCase();
    const description = (singleMatch[2] || "").trim();

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

  // PHASE 2: Fallback to heuristic extraction
  for (const message of extractableMessages) {
    const segments = parseStructure(message);
    const proseText = getExtractableText(segments);

    for (const trigger of PATTERN_TRIGGERS) {
      let match;
      const regex = new RegExp(trigger.source, trigger.flags + "g");

      while ((match = regex.exec(proseText)) !== null) {
        const fullSentence = findContainingSentence(proseText, match.index);

        if (fullSentence.length < 25 || fullSentence.length > 400) {
          continue;
        }

        const quality = await scoreCandidate(fullSentence, "pattern");
        if (!quality.passed) {
          continue;
        }

        const normalized = fullSentence.toLowerCase().replace(/\s+/g, " ").trim();
        if (seenContent.has(normalized)) {
          continue;
        }
        seenContent.add(normalized);

        patterns.push({
          id: generateId(),
          name: generatePatternName(fullSentence),
          description: fullSentence,
          usage: extractUsage(proseText, match.index + fullSentence.length),
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
  // Extract key words, skip common words
  const skipWords = new Set(["the", "a", "an", "to", "for", "with", "use", "we", "i", "will", "should"]);
  const words = description
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, "").toLowerCase())
    .filter((w) => w.length > 2 && !skipWords.has(w))
    .slice(0, 4);

  return words.join("-").substring(0, 50) || "pattern";
}

/**
 * Extract usage context
 */
function extractUsage(text: string, startIndex: number): string {
  const context = text.slice(startIndex, startIndex + 200);
  const sentences = extractSentences(context);

  for (const sentence of sentences.slice(0, 2)) {
    if (/\b(when|for|in order to|in cases where)\b/i.test(sentence)) {
      return sentence;
    }
  }

  return "";
}

// ============================================
// TASK EXTRACTION
// ============================================

const TASK_TRIGGERS = [
  /\b(TODO|FIXME|HACK|XXX)[:.]?\s*/i,
  /\b(we need to|need to|should|must|have to)\s+\w+/i,
  /\bnext,?\s+(we|I)(?:'ll)?\s+/i,
  /\b(remaining|left to do|still need)\b/i,
  /\b(add|implement|fix|update|create|write|test)\s+\w+\s+(to|for|in)/i,
  /\bneeds?\s+(to be|fixing|updating|testing)/i,
];

/**
 * Extract tasks from transcript
 */
export async function extractTasks(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Task[]> {
  const tasks: Task[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // PHASE 1a: Extract from multi-line markers [TASK: priority]...[/]
  const multiRegex = new RegExp(TASK_MARKER_MULTI.source, "gi");
  let multiMatch;
  while ((multiMatch = multiRegex.exec(fullText)) !== null) {
    const priorityStr = (multiMatch[1] || "medium").trim().toLowerCase();
    const taskText = (multiMatch[2] || "").trim();
    const priority = priorityStr === "high" ? "high" : priorityStr === "low" ? "low" : "medium";

    if (taskText.length >= 10 && taskText.length <= 2000) {
      const normalized = taskText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        tasks.push({
          id: generateId(),
          title: taskText.substring(0, 100),
          description: taskText.length > 100 ? taskText : undefined,
          status: "pending",
          priority,
          sessionCreated: sessionId,
          timestampCreated: new Date().toISOString(),
        });
      }
    }
  }

  // PHASE 1b: Extract from single-line markers [TASK: priority] description
  const singleRegex = new RegExp(TASK_MARKER_SINGLE.source, "gim");
  let singleMatch;
  while ((singleMatch = singleRegex.exec(fullText)) !== null) {
    const priorityStr = (singleMatch[1] || "medium").trim().toLowerCase();
    const taskText = (singleMatch[2] || "").trim();
    const priority = priorityStr === "high" ? "high" : priorityStr === "low" ? "low" : "medium";

    if (taskText.length >= 10 && taskText.length <= 500) {
      const normalized = taskText.toLowerCase().replace(/\s+/g, " ").trim();
      if (!seenContent.has(normalized)) {
        seenContent.add(normalized);
        tasks.push({
          id: generateId(),
          title: taskText.substring(0, 100),
          description: taskText.length > 100 ? taskText : undefined,
          status: "pending",
          priority,
          sessionCreated: sessionId,
          timestampCreated: new Date().toISOString(),
        });
      }
    }
  }

  // PHASE 2: Fallback to heuristic extraction
  const allText = extractableMessages.join(" ");

  for (const trigger of TASK_TRIGGERS) {
    let match;
    const regex = new RegExp(trigger.source, trigger.flags + "g");

    while ((match = regex.exec(allText)) !== null) {
      const fullSentence = findContainingSentence(allText, match.index);

      if (fullSentence.length < 15 || fullSentence.length > 200) {
        continue;
      }

      // Skip false positives
      if (/^(that|this|it|they|we|I)\s+(is|are|was|were|be|have|do|can|will|would|should|could)\s*$/i.test(fullSentence)) {
        continue;
      }

      const quality = await scoreCandidate(fullSentence, "task");
      if (!quality.passed) {
        continue;
      }

      const normalized = fullSentence.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenContent.has(normalized)) {
        continue;
      }
      seenContent.add(normalized);

      tasks.push({
        id: generateId(),
        title: fullSentence.substring(0, 100),
        description: fullSentence.length > 100 ? fullSentence : undefined,
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

const INSIGHT_TRIGGERS = [
  /\b(interesting(?:ly)?|notable|important(?:ly)?|key point|worth noting)\b/i,
  /\b(learned|discovered|realized|found out)\s+(that\s+)?/i,
  /\b(turns out|apparently|surprisingly)\b/i,
];

/**
 * Extract insights from transcript
 */
export async function extractInsights(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<Insight[]> {
  const insights: Insight[] = [];
  const seenContent = new Set<string>();

  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join("\n");

  // PHASE 1a: Extract from multi-line markers [INSIGHT]...[/]
  const multiRegex = new RegExp(INSIGHT_MARKER_MULTI.source, "gi");
  let multiMatch;
  while ((multiMatch = multiRegex.exec(fullText)) !== null) {
    const insightText = (multiMatch[1] || "").trim();

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

  // PHASE 1b: Extract from single-line markers [INSIGHT] text
  const singleRegex = new RegExp(INSIGHT_MARKER_SINGLE.source, "gim");
  let singleMatch;
  while ((singleMatch = singleRegex.exec(fullText)) !== null) {
    const insightText = (singleMatch[1] || "").trim();

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

  // PHASE 2: Fallback to heuristic extraction
  const allText = extractableMessages.join(" ");

  for (const trigger of INSIGHT_TRIGGERS) {
    let match;
    const regex = new RegExp(trigger.source, trigger.flags + "g");

    while ((match = regex.exec(allText)) !== null) {
      const fullSentence = findContainingSentence(allText, match.index);

      if (fullSentence.length < 20 || fullSentence.length > 300) {
        continue;
      }

      const quality = await scoreCandidate(fullSentence, "insight");
      if (!quality.passed) {
        continue;
      }

      const normalized = fullSentence.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenContent.has(normalized)) {
        continue;
      }
      seenContent.add(normalized);

      insights.push({
        id: generateId(),
        content: fullSentence,
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
  // Use first user message as base (but clean it)
  let firstMessage = transcript.userMessages[0] || "";

  // Remove command markup
  firstMessage = firstMessage
    .replace(/<command-message>.*?<\/command-message>/gi, "")
    .replace(/<command-name>.*?<\/command-name>/gi, "")
    .trim();

  // Get key actions from tool calls
  const actions: string[] = [];
  for (const call of transcript.toolCalls) {
    if (call.name === "Write") {
      const path = call.input.file_path as string;
      if (path) {
        const filename = path.split(/[/\\]/).pop();
        actions.push(`Created ${filename}`);
      }
    } else if (call.name === "Edit") {
      const path = call.input.file_path as string;
      if (path) {
        const filename = path.split(/[/\\]/).pop();
        actions.push(`Modified ${filename}`);
      }
    }
  }

  // Build summary
  let summary = firstMessage.substring(0, 200);

  if (actions.length > 0) {
    const uniqueActions = [...new Set(actions)].slice(0, 5);
    summary += `. Actions: ${uniqueActions.join(", ")}`;
  }

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
 * Extract all knowledge from a transcript (async)
 */
export async function extractAllKnowledge(
  transcript: ParsedTranscript,
  sessionId: string
): Promise<ExtractedKnowledge> {
  // Run extractions (could parallelize but embeddings are cached)
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

  // Use filtered text to avoid system content
  const extractableMessages = filterExtractableMessages(transcript.assistantMessages);
  const fullText = extractableMessages.join(" ").toLowerCase();

  for (const { pattern, topic } of DECISION_TOPICS) {
    if (pattern.test(fullText)) {
      topics.add(topic);
    }
  }

  return Array.from(topics);
}
