/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { matchesApprovalRule } from '@/process/services/approval/matcher';
import type { ChislPermissionRequest } from '@/process/services/approval/types';

const baseRequest: ChislPermissionRequest = {
  id: 'req-1',
  sessionID: 'sess-1',
  permission: 'bash',
  patterns: ['/tmp/foo.sh', '/home/user/bar.ts'],
  metadata: { command: 'npm test', risk: 'low' },
  tool: 'bash',
};

describe('matchesApprovalRule', () => {
  it('matches exact permission', () => {
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'exact',
        field: 'permission',
        patterns: ['bash'],
      })
    ).toBe(true);
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'exact',
        field: 'permission',
        patterns: ['read'],
      })
    ).toBe(false);
  });

  it('matches glob patterns', () => {
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'glob',
        field: 'patterns',
        patterns: ['*.sh'],
      })
    ).toBe(true);
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'glob',
        field: 'patterns',
        patterns: ['*.py'],
      })
    ).toBe(false);
  });

  it('matches regex patterns', () => {
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'regex',
        field: 'patterns',
        patterns: ['\\.ts$'],
      })
    ).toBe(true);
  });

  it('matches prefix patterns', () => {
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'prefix',
        field: 'patterns',
        patterns: ['/tmp/'],
      })
    ).toBe(true);
  });

  it('matches metadata via path', () => {
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'exact',
        field: 'metadata',
        path: 'command',
        patterns: ['npm test'],
      })
    ).toBe(true);
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'exact',
        field: 'metadata',
        path: 'risk',
        patterns: ['high'],
      })
    ).toBe(false);
  });

  it('matches composite and/or children', () => {
    const andMatcher = {
      type: 'composite' as const,
      operator: 'and' as const,
      children: [
        { type: 'exact' as const, field: 'permission' as const, patterns: ['bash'] },
        { type: 'prefix' as const, field: 'patterns' as const, patterns: ['/tmp/'] },
      ],
    };
    expect(matchesApprovalRule(baseRequest, andMatcher)).toBe(true);

    const orMatcher = {
      type: 'composite' as const,
      operator: 'or' as const,
      children: [
        { type: 'exact' as const, field: 'permission' as const, patterns: ['read'] },
        { type: 'exact' as const, field: 'permission' as const, patterns: ['bash'] },
      ],
    };
    expect(matchesApprovalRule(baseRequest, orMatcher)).toBe(true);
  });

  it('respects matchMode all', () => {
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'prefix',
        field: 'patterns',
        patterns: ['/tmp/', '/home/'],
        matchMode: 'all',
      })
    ).toBe(true);
    expect(
      matchesApprovalRule(baseRequest, {
        type: 'prefix',
        field: 'patterns',
        patterns: ['/tmp/', '/var/'],
        matchMode: 'all',
      })
    ).toBe(false);
  });
});
