/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  AGENT_MODES,
  getAgentModes,
  mergeWithCapabilities,
  supportsModeSwitch,
} from '@renderer/utils/model/agentModes';

describe('AGENT_MODES.claude', () => {
  const claudeModes = AGENT_MODES.claude;

  it('has exactly 5 modes', () => {
    expect(claudeModes).toHaveLength(5);
  });

  it('contains all 5 Claude Code permission modes', () => {
    const values = claudeModes.map((m) => m.value);
    expect(values).toEqual(['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk']);
  });

  it('each mode has a non-empty label', () => {
    for (const mode of claudeModes) {
      expect(mode.label).toBeTruthy();
    }
  });

  it('acceptEdits, dontAsk have descriptions', () => {
    const withDesc = claudeModes.filter((m) => ['acceptEdits', 'dontAsk'].includes(m.value));
    expect(withDesc).toHaveLength(2);
    for (const mode of withDesc) {
      expect(mode.description).toBeTruthy();
    }
  });
});

describe('getAgentModes', () => {
  it('returns claude modes for "claude" backend', () => {
    const modes = getAgentModes('claude');
    expect(modes).toHaveLength(5);
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

describe('mergeWithCapabilities', () => {
  it('should return static modes when capabilityModes is null', () => {
    const result = mergeWithCapabilities('aionrs', null);
    expect(result).toEqual(getAgentModes('aionrs'));
  });

  it('should return static modes when capabilityModes is empty', () => {
    const result = mergeWithCapabilities('aionrs', []);
    expect(result).toEqual(getAgentModes('aionrs'));
  });

  it('should use static labels for known modes', () => {
    const result = mergeWithCapabilities('aionrs', ['default', 'auto_edit', 'yolo']);
    expect(result).toEqual([
      { value: 'default', label: 'Default' },
      { value: 'auto_edit', label: 'Auto-Accept Edits' },
      { value: 'yolo', label: 'YOLO' },
    ]);
  });

  it('should include unknown modes from capabilities with title-cased label', () => {
    const result = mergeWithCapabilities('aionrs', ['default', 'auto_edit', 'plan']);
    expect(result).toEqual([
      { value: 'default', label: 'Default' },
      { value: 'auto_edit', label: 'Auto-Accept Edits' },
      { value: 'plan', label: 'Plan' },
    ]);
  });

  it('should exclude static modes not in capabilities', () => {
    const result = mergeWithCapabilities('aionrs', ['default', 'yolo']);
    expect(result).toEqual([
      { value: 'default', label: 'Default' },
      { value: 'yolo', label: 'YOLO' },
    ]);
  });

  it('should return title-cased modes for unknown backend', () => {
    const result = mergeWithCapabilities('unknown-backend', ['default', 'plan']);
    expect(result).toEqual([
      { value: 'default', label: 'Default' },
      { value: 'plan', label: 'Plan' },
    ]);
  });
});
