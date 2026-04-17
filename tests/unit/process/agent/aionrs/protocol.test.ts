/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  describeAionrsLimitWindow,
  formatAionrsLimitLabel,
  formatAionrsPercent,
  getAionrsLimitBucketPrefix,
  getAionrsRemainingPercent,
  humanizeAionrsIdentifier,
  type AionrsAccountLimit,
} from '@/process/agent/aionrs/protocol';

describe('aionrs quota helpers', () => {
  const baseLimit: AionrsAccountLimit = {
    limit_id: 'codex',
    limit_name: undefined,
    primary: undefined,
    secondary: undefined,
    credits: undefined,
  };

  it('maps window sizes to codex-style labels', () => {
    expect(describeAionrsLimitWindow(300)).toBe('5h');
    expect(describeAionrsLimitWindow(10_080)).toBe('weekly');
    expect(describeAionrsLimitWindow(43_200)).toBe('monthly');
    expect(describeAionrsLimitWindow(60_000)).toBe('annual');
  });

  it('suppresses the default codex bucket prefix', () => {
    expect(getAionrsLimitBucketPrefix(baseLimit)).toBeNull();
    expect(
      getAionrsLimitBucketPrefix({
        ...baseLimit,
        limit_id: 'codex_other',
        limit_name: 'codex_other',
      })
    ).toBe('codex-other');
  });

  it('builds compact quota labels and percentages', () => {
    const labeledLimit: AionrsAccountLimit = {
      ...baseLimit,
      limit_id: 'codex_other',
      limit_name: 'codex_other',
      primary: {
        used_percent: 12,
        window_minutes: 60,
        resets_at: undefined,
      },
    };

    expect(formatAionrsLimitLabel(baseLimit, { window_minutes: 300 }, '5h')).toBe('5h');
    expect(formatAionrsLimitLabel(labeledLimit, labeledLimit.primary, '5h')).toBe('codex-other 1h');
    expect(getAionrsRemainingPercent(12)).toBe(88);
    expect(formatAionrsPercent(88)).toBe('88%');
    expect(formatAionrsPercent(33.34)).toBe('33.3%');
  });

  it('humanizes identifiers for plan and bucket names', () => {
    expect(humanizeAionrsIdentifier('self_serve_business_usage_based')).toBe('Self Serve Business Usage Based');
    expect(humanizeAionrsIdentifier('codex-other monthly')).toBe('Codex Other Monthly');
  });
});
