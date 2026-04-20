/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { formatTokenCount, getContextUsageLevel } from '../../../src/renderer/components/agent/ContextUsageIndicator';
import {
  DEFAULT_CONTEXT_LIMIT,
  getConversationContextLimit,
} from '../../../src/renderer/utils/model/modelContextLimits';

describe('context usage helpers', () => {
  it('formats token counts compactly', () => {
    expect(formatTokenCount(1530)).toBe('1.5K');
    expect(formatTokenCount(1_000_000, true)).toBe('1M');
  });

  it('classifies warning thresholds consistently', () => {
    expect(getContextUsageLevel(79.9)).toBe('normal');
    expect(getContextUsageLevel(80)).toBe('warning');
    expect(getContextUsageLevel(90)).toBe('danger');
  });

  it('prefers persisted ACP limits over model defaults', () => {
    expect(
      getConversationContextLimit({
        model: {
          useModel: 'claude-3.7-sonnet',
        },
        extra: {
          lastContextLimit: 32000,
        },
      } as never)
    ).toBe(32000);
  });

  it('falls back to model-based limits when persisted metadata is absent', () => {
    expect(
      getConversationContextLimit({
        model: {
          useModel: 'gpt-4o',
        },
        extra: {},
      } as never)
    ).toBe(128000);

    expect(
      getConversationContextLimit({
        model: {
          useModel: undefined,
        },
        extra: {},
      } as never)
    ).toBe(DEFAULT_CONTEXT_LIMIT);
  });
});
