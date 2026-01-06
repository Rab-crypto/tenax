/**
 * Extraction quality scorer using embedding similarity
 * Compares extraction candidates against golden examples
 */

import type { QualityScore, KnowledgeType } from "./types";
import { getEmbedding, cosineSimilarity } from "./embeddings";

// ============================================
// GOLDEN EXAMPLES
// ============================================

const GOLDEN_DECISIONS = [
  "We decided to use Bun as the runtime because it has native TypeScript support and fast SQLite bindings",
  "Going with React for the frontend due to its component model and large ecosystem",
  "Using SQLite for storage since it's embedded and requires no separate server process",
  "Chose PostgreSQL over MySQL for better JSON support and advanced features",
  "We'll implement authentication using JWT tokens for stateless session management",
  "Selected Tailwind CSS for styling because of utility-first approach and build-time optimization",
  "Decided to use a monorepo structure with Turborepo for better code sharing",
  "Going with REST over GraphQL for simpler implementation and caching",
  "We opted for server-side rendering with Next.js for better SEO and initial load performance",
  "Choosing TypeScript strict mode for better type safety across the codebase",
];

const GOLDEN_TASKS = [
  "Add unit tests for the authentication module",
  "Implement error handling for API endpoints",
  "Update documentation with new configuration options",
  "Refactor the database queries to use prepared statements",
  "Set up CI/CD pipeline for automated deployments",
  "Create migration scripts for the new schema",
  "Add input validation for user registration form",
  "Implement rate limiting for public API endpoints",
  "Write integration tests for the payment flow",
  "Fix the memory leak in the WebSocket handler",
];

const GOLDEN_PATTERNS = [
  "Use barrel files to re-export from feature directories for cleaner imports",
  "Implement the repository pattern for all database operations to abstract storage",
  "Follow the convention of prefixing private methods with underscore",
  "Structure components with hooks at top, handlers in middle, render at bottom",
  "Use discriminated unions for action types in reducers",
  "Apply the facade pattern for third-party service integrations",
  "Name test files with .test.ts suffix and colocate with source files",
  "Use environment variables for all configuration with sensible defaults",
];

const GOLDEN_INSIGHTS = [
  "The performance bottleneck was in the N+1 query pattern we were using for comments",
  "Turns out the library doesn't support tree-shaking so we need to use named imports",
  "The API rate limits are per-user not per-app which changes our caching strategy",
  "Discovered that the timeout was caused by a missing await on the database call",
  "The memory usage spikes were from not properly disposing of event listeners",
  "Found that Safari handles date parsing differently than Chrome",
];

// Cache for golden example embeddings
let goldenEmbeddingsCache: Map<KnowledgeType, Float32Array[]> | null = null;

// ============================================
// QUALITY THRESHOLDS
// ============================================

const QUALITY_THRESHOLDS: Record<KnowledgeType, number> = {
  decision: 0.35,  // Lowered from 0.45 to allow more matches
  task: 0.40,      // Lowered from 0.50
  pattern: 0.35,   // Lowered from 0.45
  insight: 0.30,   // Lowered from 0.40
};

const MIN_LENGTHS: Record<KnowledgeType, number> = {
  decision: 20,
  task: 15,
  pattern: 25,
  insight: 20,
};

// ============================================
// EMBEDDING CACHE
// ============================================

/**
 * Initialize golden example embeddings (cached for performance)
 */
async function initializeGoldenEmbeddings(): Promise<Map<KnowledgeType, Float32Array[]>> {
  if (goldenEmbeddingsCache) {
    return goldenEmbeddingsCache;
  }

  console.error("Initializing golden example embeddings...");

  const cache = new Map<KnowledgeType, Float32Array[]>();

  // Generate embeddings for each type
  const types: Array<{ type: KnowledgeType; examples: string[] }> = [
    { type: "decision", examples: GOLDEN_DECISIONS },
    { type: "task", examples: GOLDEN_TASKS },
    { type: "pattern", examples: GOLDEN_PATTERNS },
    { type: "insight", examples: GOLDEN_INSIGHTS },
  ];

  for (const { type, examples } of types) {
    const embeddings: Float32Array[] = [];
    for (const example of examples) {
      const embedding = await getEmbedding(example);
      embeddings.push(embedding);
    }
    cache.set(type, embeddings);
  }

  goldenEmbeddingsCache = cache;
  console.error("Golden embeddings initialized");
  return cache;
}

// ============================================
// SCORING FUNCTIONS
// ============================================

/**
 * Score a candidate extraction by comparing to golden examples
 * Returns max similarity score across all golden examples
 */
export async function scoreCandidate(
  text: string,
  type: KnowledgeType
): Promise<QualityScore> {
  const reasons: string[] = [];

  // Quick rejection based on length
  const minLength = MIN_LENGTHS[type];
  if (text.length < minLength) {
    return {
      score: 0,
      passed: false,
      reasons: [`Too short (${text.length} < ${minLength} chars)`],
    };
  }

  // Quick rejection based on content patterns
  const quickReject = quickRejectCandidate(text);
  if (quickReject) {
    return {
      score: 0,
      passed: false,
      reasons: [quickReject],
    };
  }

  // Get golden embeddings
  const goldenCache = await initializeGoldenEmbeddings();
  const goldenEmbeddings = goldenCache.get(type);

  if (!goldenEmbeddings || goldenEmbeddings.length === 0) {
    // No golden examples, use heuristic scoring
    return heuristicScore(text, type);
  }

  // Generate embedding for candidate
  const candidateEmbedding = await getEmbedding(text);

  // Find max similarity across golden examples
  let maxSimilarity = 0;
  for (const goldenEmbedding of goldenEmbeddings) {
    const similarity = cosineSimilarity(candidateEmbedding, goldenEmbedding);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }
  }

  const threshold = QUALITY_THRESHOLDS[type];
  const passed = maxSimilarity >= threshold;

  if (passed) {
    reasons.push(`Similarity ${(maxSimilarity * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(1)}% threshold`);
  } else {
    reasons.push(`Similarity ${(maxSimilarity * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% threshold`);
  }

  return {
    score: maxSimilarity,
    passed,
    reasons,
  };
}

/**
 * Quick rejection based on obvious bad patterns
 */
function quickRejectCandidate(text: string): string | null {
  // Trailing colon/comma (incomplete thought)
  if (/[,:]\s*$/.test(text)) {
    return "Incomplete (ends with colon/comma)";
  }

  // Just punctuation or whitespace
  if (/^[\s\W]*$/.test(text)) {
    return "Only punctuation/whitespace";
  }

  // Starts with lowercase continuation words
  if (/^(and|or|but|so|then|also|however)\s/i.test(text)) {
    return "Starts with continuation word";
  }

  // Contains regex literals
  if (/\/[^/]+\/[gimsuvy]*/.test(text) && text.length < 50) {
    return "Contains regex literal";
  }

  // Looks like code (multiple backticks, pipes)
  if ((text.match(/`/g) || []).length > 4) {
    return "Appears to be code snippet";
  }

  // System prompt markers
  if (/system-reminder|<function_results>|CRITICAL:|malware/i.test(text)) {
    return "System content";
  }

  // Just a pronoun or article
  if (/^(the|a|an|this|that|it|they|we|I)\s*$/i.test(text)) {
    return "Only pronoun/article";
  }

  return null;
}

/**
 * Fallback heuristic scoring when embeddings not available
 */
function heuristicScore(text: string, type: KnowledgeType): QualityScore {
  const reasons: string[] = [];
  let score = 0.5; // Base score

  // Length bonus
  if (text.length >= 50) {
    score += 0.1;
    reasons.push("Good length");
  }

  // Has subject
  if (/\b(we|I|the team|our)\b/i.test(text)) {
    score += 0.1;
    reasons.push("Has subject");
  }

  // Has action verb
  if (/\b(use|implement|add|create|build|configure|chose|decided|selected)\b/i.test(text)) {
    score += 0.1;
    reasons.push("Has action verb");
  }

  // Has rationale connector
  if (/\b(because|since|due to|for|as)\b/i.test(text)) {
    score += 0.1;
    reasons.push("Has rationale");
  }

  // Type-specific bonuses
  if (type === "decision") {
    if (/\b(decided|chose|selected|opted|going with|will use)\b/i.test(text)) {
      score += 0.1;
      reasons.push("Explicit decision language");
    }
  } else if (type === "task") {
    if (/\b(add|implement|fix|update|create|write|test)\b/i.test(text)) {
      score += 0.1;
      reasons.push("Task action word");
    }
  }

  const threshold = QUALITY_THRESHOLDS[type];
  return {
    score,
    passed: score >= threshold,
    reasons,
  };
}

/**
 * Batch score multiple candidates (more efficient)
 */
export async function scoreCandidates(
  candidates: string[],
  type: KnowledgeType
): Promise<QualityScore[]> {
  const results: QualityScore[] = [];

  for (const candidate of candidates) {
    const score = await scoreCandidate(candidate, type);
    results.push(score);
  }

  return results;
}

/**
 * Reset the golden embeddings cache (for testing)
 */
export function resetGoldenCache(): void {
  goldenEmbeddingsCache = null;
}
