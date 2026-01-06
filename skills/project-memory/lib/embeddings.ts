/**
 * Embeddings wrapper using Transformers.js
 * Provides local embedding generation with the all-MiniLM-L6-v2 model
 */

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Embedding dimension for all-MiniLM-L6-v2
export const EMBEDDING_DIM = 384;

// Default model
export const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

// Singleton pipeline instance
let extractor: FeatureExtractionPipeline | null = null;
let currentModel: string | null = null;

/**
 * Initialize the embedding pipeline
 * Downloads model on first use (~23MB)
 */
export async function initializeEmbeddings(
  modelName: string = DEFAULT_MODEL
): Promise<FeatureExtractionPipeline> {
  if (extractor && currentModel === modelName) {
    return extractor;
  }

  console.error(`Loading embedding model: ${modelName}...`);

  extractor = await pipeline("feature-extraction", modelName, {
    // Use fp16 for faster inference if available
    dtype: "fp32",
  });

  currentModel = modelName;
  console.error("Embedding model loaded.");

  return extractor;
}

/**
 * Generate embedding for a single text
 */
export async function getEmbedding(
  text: string,
  modelName: string = DEFAULT_MODEL
): Promise<Float32Array> {
  const pipe = await initializeEmbeddings(modelName);

  // Truncate very long texts to avoid memory issues
  const truncatedText = text.length > 8000 ? text.slice(0, 8000) : text;

  const output = await pipe(truncatedText, {
    pooling: "mean",
    normalize: true,
  });

  // Extract the embedding data
  return new Float32Array(output.data as ArrayLike<number>);
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function getEmbeddings(
  texts: string[],
  modelName: string = DEFAULT_MODEL
): Promise<Float32Array[]> {
  if (texts.length === 0) {
    return [];
  }

  const pipe = await initializeEmbeddings(modelName);

  // Truncate very long texts
  const truncatedTexts = texts.map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));

  const output = await pipe(truncatedTexts, {
    pooling: "mean",
    normalize: true,
  });

  // Split batch output into individual embeddings
  const results: Float32Array[] = [];
  const data = output.data as ArrayLike<number>;

  for (let i = 0; i < texts.length; i++) {
    const start = i * EMBEDDING_DIM;
    const end = start + EMBEDDING_DIM;
    results.push(new Float32Array(Array.from(data).slice(start, end)));
  }

  return results;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Find top-k most similar embeddings using cosine similarity
 * Fallback for when sqlite-vec is not available
 */
export function findSimilar(
  query: Float32Array,
  candidates: Array<{ id: string; embedding: Float32Array }>,
  topK: number = 10
): Array<{ id: string; score: number }> {
  const scored = candidates.map((c) => ({
    id: c.id,
    score: cosineSimilarity(query, c.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

/**
 * Create text for embedding from a decision
 */
export function createDecisionText(decision: {
  topic: string;
  decision: string;
  rationale: string;
}): string {
  return `${decision.topic}: ${decision.decision}. Rationale: ${decision.rationale}`;
}

/**
 * Create text for embedding from a pattern
 */
export function createPatternText(pattern: {
  name: string;
  description: string;
  usage: string;
}): string {
  return `${pattern.name}: ${pattern.description}. Usage: ${pattern.usage}`;
}

/**
 * Create text for embedding from a task
 */
export function createTaskText(task: { title: string; description?: string }): string {
  return task.description ? `${task.title}: ${task.description}` : task.title;
}

/**
 * Create text for embedding from an insight
 */
export function createInsightText(insight: { content: string; context?: string }): string {
  return insight.context ? `${insight.content} (Context: ${insight.context})` : insight.content;
}

/**
 * Create text for embedding from a session summary
 */
export function createSessionText(session: {
  summary: string;
  keyTopics?: string[];
}): string {
  const topics = session.keyTopics?.join(", ") || "";
  return topics ? `${session.summary}. Topics: ${topics}` : session.summary;
}
