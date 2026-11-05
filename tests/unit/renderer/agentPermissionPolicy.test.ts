/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the permission-policy normalization helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  AGENT_PERMISSION_LEVEL_OPTIONS,
  isPermissionPolicyActionable,
  type AgentPermissionPolicy,
} from '@/renderer/utils/model/agentPermissionPolicy';

const basePolicy: AgentPermissionPolicy = {
  agent: 'opencode',
  supported: true,
  installed: true,
  current_level: null,
  config_path: '/home/user/.config/opencode/opencode.json',
};

describe('isPermissionPolicyActionable', () => {
  it('is true only when supported AND installed', () => {
    expect(isPermissionPolicyActionable(basePolicy)).toBe(true);
    expect(isPermissionPolicyActionable({ ...basePolicy, installed: false })).toBe(false);
    expect(isPermissionPolicyActionable({ ...basePolicy, supported: false })).toBe(false);
    expect(isPermissionPolicyActionable({ ...basePolicy, supported: false, installed: false })).toBe(false);
  });

  it('is false for undefined policy', () => {
    expect(isPermissionPolicyActionable(undefined)).toBe(false);
  });
});

describe('AGENT_PERMISSION_LEVEL_OPTIONS', () => {
  it('offers the three normalized levels in display order with label keys', () => {
    expect(AGENT_PERMISSION_LEVEL_OPTIONS.map((o) => o.value)).toEqual(['ask', 'auto_edit', 'full_auto']);
    for (const opt of AGENT_PERMISSION_LEVEL_OPTIONS) {
      expect(opt.labelKey.startsWith('settings.agentManagement.permission')).toBe(true);
    }
  });
});
