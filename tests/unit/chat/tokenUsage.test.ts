/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { accumulateTokenUsage, extractTokenMetrics, sumTokenUsages } from '@/common/chat/tokenUsage';
import type { TokenUsageData } from '@/common/config/storage';

describe('tokenUsage utilities', () => {
  describe('extractTokenMetrics', () => {
    it('returns zeros for null or undefined', () => {
      expect(extractTokenMetrics(null)).toEqual({
        total: 0,
        input: 0,
        output: 0,
        cache: 0,
        cacheRead: 0,
        cacheWrite: 0,
        thought: 0,
      });
      expect(extractTokenMetrics(undefined)).toEqual({
        total: 0,
        input: 0,
        output: 0,
        cache: 0,
        cacheRead: 0,
        cacheWrite: 0,
        thought: 0,
      });
    });

    it('extracts metrics with read and write cache', () => {
      const usage: TokenUsageData = {
        total_tokens: 1500,
        breakdown: {
          input_tokens: 1000,
          output_tokens: 200,
          cached_read_tokens: 250,
          cached_write_tokens: 50,
          thought_tokens: 100,
        },
        cost: { amount: 0.05, currency: 'USD' },
      };

      const metrics = extractTokenMetrics(usage);
      expect(metrics.total).toBe(1500);
      expect(metrics.input).toBe(1000);
      expect(metrics.output).toBe(200);
      expect(metrics.cache).toBe(300); // 250 + 50
      expect(metrics.cacheRead).toBe(250);
      expect(metrics.cacheWrite).toBe(50);
      expect(metrics.thought).toBe(100);
      expect(metrics.cost).toEqual({ amount: 0.05, currency: 'USD' });
    });

    it('falls back to generic cached_tokens if read/write are absent', () => {
      const usage: TokenUsageData = {
        total_tokens: 800,
        breakdown: {
          input_tokens: 600,
          output_tokens: 100,
          cached_tokens: 100,
        },
      };

      const metrics = extractTokenMetrics(usage);
      expect(metrics.cache).toBe(100);
    });
  });

  describe('sumTokenUsages', () => {
    it('sums multiple turn usages correctly', () => {
      const turns: Record<string, TokenUsageData> = {
        'msg-1': {
          total_tokens: 1000,
          breakdown: {
            input_tokens: 800,
            output_tokens: 150,
            cached_read_tokens: 400,
          },
          cost: { amount: 0.01, currency: 'USD' },
        },
        'msg-2': {
          total_tokens: 2000,
          breakdown: {
            input_tokens: 1500,
            output_tokens: 350,
            cached_read_tokens: 1000,
            cached_write_tokens: 100,
            thought_tokens: 50,
          },
          cost: { amount: 0.02, currency: 'USD' },
        },
      };

      const result = sumTokenUsages(turns);
      expect(result.total_tokens).toBe(3000);
      expect(result.breakdown?.input_tokens).toBe(2300);
      expect(result.breakdown?.output_tokens).toBe(500);
      expect(result.breakdown?.cached_read_tokens).toBe(1400);
      expect(result.breakdown?.cached_write_tokens).toBe(100);
      expect(result.breakdown?.thought_tokens).toBe(50);
      expect(result.cost).toEqual({ amount: 0.03, currency: 'USD' });
    });

    it('handles empty turns dict', () => {
      const result = sumTokenUsages({});
      expect(result).toEqual({ total_tokens: 0 });
    });
  });

  describe('accumulateTokenUsage', () => {
    it('initializes from single turn if previous is null', () => {
      const turn: TokenUsageData = {
        total_tokens: 500,
        breakdown: { input_tokens: 400, output_tokens: 100 },
      };
      const result = accumulateTokenUsage(null, turn);
      expect(result.total_tokens).toBe(500);
      expect(result.breakdown?.input_tokens).toBe(400);
      expect(result.breakdown?.output_tokens).toBe(100);
    });

    it('adds turn to previous cumulative total', () => {
      const prev: TokenUsageData = {
        total_tokens: 500,
        breakdown: { input_tokens: 400, output_tokens: 100 },
      };
      const turn: TokenUsageData = {
        total_tokens: 600,
        breakdown: { input_tokens: 500, output_tokens: 100, cached_read_tokens: 200 },
      };
      const result = accumulateTokenUsage(prev, turn);
      expect(result.total_tokens).toBe(1100);
      expect(result.breakdown?.input_tokens).toBe(900);
      expect(result.breakdown?.output_tokens).toBe(200);
      expect(result.breakdown?.cached_read_tokens).toBe(200);
    });
  });
});
