/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TokenUsageBreakdown, TokenUsageCost, TokenUsageData } from '../config/storage';

export interface FormattedTokenMetrics {
  total: number;
  input: number;
  output: number;
  cache: number;
  cacheRead: number;
  cacheWrite: number;
  thought: number;
  cost?: TokenUsageCost;
}

/**
 * Extract numerical token counters and cost from a TokenUsageData object,
 * normalizing different caching formats (cache_read_tokens, cache_write_tokens, cached_tokens).
 */
export function extractTokenMetrics(usage: TokenUsageData | null | undefined): FormattedTokenMetrics {
  if (!usage) {
    return {
      total: 0,
      input: 0,
      output: 0,
      cache: 0,
      cacheRead: 0,
      cacheWrite: 0,
      thought: 0,
    };
  }

  const breakdown = usage.breakdown;
  const input = breakdown?.input_tokens ?? 0;
  const output = breakdown?.output_tokens ?? 0;
  const cacheRead = breakdown?.cached_read_tokens ?? 0;
  const cacheWrite = breakdown?.cached_write_tokens ?? 0;
  const genericCache = breakdown?.cached_tokens ?? 0;
  const cache = cacheRead + cacheWrite > 0 ? cacheRead + cacheWrite : genericCache;
  const thought = breakdown?.thought_tokens ?? 0;

  const total = usage.total_tokens > 0 ? usage.total_tokens : input + output + cache;

  return {
    total,
    input,
    output,
    cache,
    cacheRead,
    cacheWrite,
    thought,
    ...(usage.cost ? { cost: usage.cost } : {}),
  };
}

/**
 * Sum an entire dictionary of turn-level TokenUsageData objects into
 * a single cumulative TokenUsageData representation for the conversation session.
 */
export function sumTokenUsages(turnsUsage: Record<string, TokenUsageData>): TokenUsageData {
  let total_tokens = 0;
  let input_tokens = 0;
  let output_tokens = 0;
  let cached_read_tokens = 0;
  let cached_write_tokens = 0;
  let cached_tokens = 0;
  let thought_tokens = 0;
  let totalCostAmount = 0;
  let costCurrency = 'USD';
  let hasBreakdown = false;

  for (const usage of Object.values(turnsUsage)) {
    if (!usage) continue;
    total_tokens += usage.total_tokens || 0;

    if (usage.cost && typeof usage.cost.amount === 'number' && usage.cost.amount > 0) {
      totalCostAmount += usage.cost.amount;
      if (usage.cost.currency) {
        costCurrency = usage.cost.currency;
      }
    }

    const b = usage.breakdown;
    if (b) {
      hasBreakdown = true;
      if (typeof b.input_tokens === 'number') input_tokens += b.input_tokens;
      if (typeof b.output_tokens === 'number') output_tokens += b.output_tokens;
      if (typeof b.cached_read_tokens === 'number') cached_read_tokens += b.cached_read_tokens;
      if (typeof b.cached_write_tokens === 'number') cached_write_tokens += b.cached_write_tokens;
      if (typeof b.cached_tokens === 'number') cached_tokens += b.cached_tokens;
      if (typeof b.thought_tokens === 'number') thought_tokens += b.thought_tokens;
    }
  }

  const breakdown: TokenUsageBreakdown = {};
  if (input_tokens > 0) breakdown.input_tokens = input_tokens;
  if (output_tokens > 0) breakdown.output_tokens = output_tokens;
  if (cached_read_tokens > 0) breakdown.cached_read_tokens = cached_read_tokens;
  if (cached_write_tokens > 0) breakdown.cached_write_tokens = cached_write_tokens;
  if (cached_tokens > 0) breakdown.cached_tokens = cached_tokens;
  if (thought_tokens > 0) breakdown.thought_tokens = thought_tokens;

  const result: TokenUsageData = {
    total_tokens,
    ...(hasBreakdown ? { breakdown } : {}),
  };

  if (totalCostAmount > 0) {
    result.cost = { amount: totalCostAmount, currency: costCurrency };
  }

  return result;
}

/**
 * Accumulate a new turn's token usage into a previous cumulative total.
 */
export function accumulateTokenUsage(
  previous: TokenUsageData | null | undefined,
  turnUsage: TokenUsageData
): TokenUsageData {
  if (!previous) {
    return {
      total_tokens: turnUsage.total_tokens,
      ...(turnUsage.breakdown ? { breakdown: { ...turnUsage.breakdown } } : {}),
      ...(turnUsage.cost ? { cost: { ...turnUsage.cost } } : {}),
    };
  }

  const prevMetrics = extractTokenMetrics(previous);
  const turnMetrics = extractTokenMetrics(turnUsage);

  const total_tokens = previous.total_tokens + turnUsage.total_tokens;

  const breakdown: TokenUsageBreakdown = {};
  const totalInput = prevMetrics.input + turnMetrics.input;
  const totalOutput = prevMetrics.output + turnMetrics.output;
  const totalCacheRead = prevMetrics.cacheRead + turnMetrics.cacheRead;
  const totalCacheWrite = prevMetrics.cacheWrite + turnMetrics.cacheWrite;
  const totalThought = prevMetrics.thought + turnMetrics.thought;

  if (totalInput > 0) breakdown.input_tokens = totalInput;
  if (totalOutput > 0) breakdown.output_tokens = totalOutput;
  if (totalCacheRead > 0) breakdown.cached_read_tokens = totalCacheRead;
  if (totalCacheWrite > 0) breakdown.cached_write_tokens = totalCacheWrite;
  if (totalThought > 0) breakdown.thought_tokens = totalThought;

  const totalCost = (prevMetrics.cost?.amount ?? 0) + (turnMetrics.cost?.amount ?? 0);
  const currency = turnMetrics.cost?.currency || prevMetrics.cost?.currency || 'USD';

  return {
    total_tokens,
    ...(Object.keys(breakdown).length > 0 ? { breakdown } : {}),
    ...(totalCost > 0 ? { cost: { amount: totalCost, currency } } : {}),
  };
}

/**
 * Estimate token count for a text string using standard multilingual heuristics:
 * - English/Latin: ~1 token per 4 characters or ~1.3 tokens per word
 * - CJK/Non-Latin: ~1 token per character
 */
export function estimateTokenCount(text: string | null | undefined): number {
  if (!text || !text.trim()) return 0;
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjk = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const words = nonCjk.trim().split(/\s+/).filter(Boolean);
  const nonCjkTokens = Math.max(Math.ceil(nonCjk.length / 4), Math.ceil(words.length * 1.3));
  return Math.max(1, cjkCount + nonCjkTokens);
}

/**
 * Fallback token estimation for assistant turns when the agent or provider
 * does not report native token usage metadata (e.g. Aionrs or custom proxies).
 */
export function estimateTurnTokenUsage(assistantContent: string, promptText?: string): TokenUsageData {
  const outputTokens = Math.max(1, estimateTokenCount(assistantContent));
  const promptTokens = promptText ? estimateTokenCount(promptText) : 0;
  // Account for base agent system prompt and tools context (typically ~420 tokens)
  const inputTokens = Math.max(15, promptTokens + 420);
  const totalTokens = inputTokens + outputTokens;

  return {
    total_tokens: totalTokens,
    breakdown: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: 0,
    },
  };
}
