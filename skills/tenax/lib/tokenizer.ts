/**
 * Token counting utilities
 * Uses @anthropic-ai/tokenizer for accurate Claude token counting
 */

import { countTokens as anthropicCountTokens } from "@anthropic-ai/tokenizer";

// Fallback: Average characters per token for English text
const CHARS_PER_TOKEN = 4;

/**
 * Count tokens in text using Anthropic's tokenizer
 * Falls back to character-based estimation if tokenizer fails
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    return anthropicCountTokens(text);
  } catch {
    // Fallback to estimation if tokenizer fails
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}

/**
 * Count tokens in an object (JSON serialized)
 */
export function countObjectTokens(obj: unknown): number {
  const json = JSON.stringify(obj);
  return countTokens(json);
}

/**
 * Format token count with budget percentage
 */
export function formatTokenInfo(count: number, budget: number): string {
  const percentage = ((count / budget) * 100).toFixed(1);
  return `${count.toLocaleString()} tokens (${percentage}% of budget)`;
}

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const currentTokens = countTokens(text);
  if (currentTokens <= maxTokens) {
    return text;
  }

  // Estimate character limit
  const charLimit = maxTokens * CHARS_PER_TOKEN;
  const truncated = text.slice(0, charLimit - 3) + "...";
  return truncated;
}

/**
 * Calculate cost estimate based on token count and pricing
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { inputPer1MTokens: number | null; outputPer1MTokens: number | null }
): { input: number | null; output: number | null; total: number | null } {
  const inputCost = pricing.inputPer1MTokens
    ? (inputTokens / 1_000_000) * pricing.inputPer1MTokens
    : null;

  const outputCost = pricing.outputPer1MTokens
    ? (outputTokens / 1_000_000) * pricing.outputPer1MTokens
    : null;

  const total = inputCost !== null && outputCost !== null ? inputCost + outputCost : null;

  return { input: inputCost, output: outputCost, total };
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number | null): string {
  if (cost === null) return "N/A";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
