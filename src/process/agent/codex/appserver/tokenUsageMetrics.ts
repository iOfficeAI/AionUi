/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CodexContextUsageMetrics = {
  used: number;
  size: number;
};

export function readCodexContextUsageMetrics(params: unknown): CodexContextUsageMetrics {
  const record = asRecord(params);
  const tokenUsage = asRecord(record?.tokenUsage) ?? asRecord(record?.token_usage);
  const last = asRecord(tokenUsage?.last);
  const total = asRecord(tokenUsage?.total);

  return {
    used:
      readNumber(last?.totalTokens) ??
      readNumber(last?.total_tokens) ??
      readNumber(total?.totalTokens) ??
      readNumber(total?.total_tokens) ??
      readNumber(record?.used) ??
      readNumber(record?.totalTokens) ??
      readNumber(record?.total_tokens) ??
      0,
    size:
      readNumber(tokenUsage?.modelContextWindow) ??
      readNumber(tokenUsage?.model_context_window) ??
      readNumber(record?.size) ??
      readNumber(record?.contextWindow) ??
      readNumber(record?.context_window) ??
      0,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
