/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { AGENT_MODES, getAgentModes, supportsModeSwitch } from '@renderer/utils/model/agentModes';

describe('AGENT_MODES.claude', () => {
  const claudeModes = AGENT_MODES.claude;

  it('has exactly 6 modes', () => {
    expect(claudeModes).toHaveLength(6);
  });

  it('contains all 6 Claude Code permission modes', () => {
    const values = claudeModes.map((m) => m.value);
    expect(values).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk']);
  });

  it('each mode has a non-empty label', () => {
    for (const mode of claudeModes) {
      expect(mode.label).toBeTruthy();
    }
  });

  it('acceptEdits, auto, dontAsk have descriptions', () => {
    const withDesc = claudeModes.filter((m) => ['acceptEdits', 'auto', 'dontAsk'].includes(m.value));
    expect(withDesc).toHaveLength(3);
    for (const mode of withDesc) {
      expect(mode.description).toBeTruthy();
    }
  });
});

describe('getAgentModes', () => {
  it('returns claude modes for "claude" backend', () => {
    const modes = getAgentModes('claude');
    expect(modes).toHaveLength(6);
    expect(modes[0].value).toBe('default');
  });

  it('returns empty array for unknown backend', () => {
    expect(getAgentModes('nonexistent')).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(getAgentModes(undefined)).toEqual([]);
  });
});

describe('supportsModeSwitch', () => {
  it('returns true for claude', () => {
    expect(supportsModeSwitch('claude')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(supportsModeSwitch(undefined)).toBe(false);
  });
});
