/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildManagedRuntimeModelId,
  getManagedRuntimeModelDisplayLabel,
  normalizeManagedRuntimeModelLabel,
  resolveManagedModelIdFromRuntime,
} from '@/common/types/agent/managedRuntimeCli';

describe('managedRuntimeCli Claude mapping', () => {
  it('maps Claude managed provider models to slot-based runtime ids', () => {
    expect(buildManagedRuntimeModelId('claude', 'claude-sonnet-4-20250514')).toBe('default');
    expect(buildManagedRuntimeModelId('claude', 'MiniMax-M2.7-highspeed')).toBe('default');
  });

  it('keeps non-Claude runtime mappings unchanged', () => {
    expect(buildManagedRuntimeModelId('hermes', 'mimo-v2.5')).toBe('custom:mimo-v2.5');
    expect(buildManagedRuntimeModelId('opencode', 'mimo-v2.5')).toContain('/mimo-v2.5');
    expect(buildManagedRuntimeModelId('openclaw', 'mimo-v2.5')).toContain('/mimo-v2.5');
  });

  it('treats Claude slot ids as runtime-only and resolves display labels from labels', () => {
    expect(resolveManagedModelIdFromRuntime('claude', 'default')).toBeUndefined();
    expect(normalizeManagedRuntimeModelLabel('claude', 'claude-sonnet-4-20250514')).toBe('claude-sonnet-4-20250514');
    expect(getManagedRuntimeModelDisplayLabel('default')).toBe('default');
  });
});
