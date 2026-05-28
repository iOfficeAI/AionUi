/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { applySavedAgentOrder } from '@/renderer/pages/guid/hooks/agentOrderUtils';
import type { AvailableAgent } from '@/renderer/pages/guid/types';
import { describe, expect, it } from 'vitest';

const agent = (overrides: Partial<AvailableAgent> & Pick<AvailableAgent, 'agent_type' | 'name'>): AvailableAgent => ({
  ...overrides,
});

const claude = agent({ agent_type: 'acp', backend: 'claude', name: 'Claude Code' });
const codex = agent({ agent_type: 'acp', backend: 'codex', name: 'Codex' });
const gemini = agent({ agent_type: 'acp', backend: 'gemini', name: 'Gemini' });
const remoteOne = agent({ agent_type: 'remote', id: 'r-1', name: 'Remote One' });

describe('applySavedAgentOrder', () => {
  it('returns the input untouched when savedOrder is undefined', () => {
    const list = [claude, codex, gemini];
    expect(applySavedAgentOrder(list, undefined)).toBe(list);
  });

  it('returns the input untouched when savedOrder is empty', () => {
    const list = [claude, codex, gemini];
    expect(applySavedAgentOrder(list, [])).toBe(list);
  });

  it('reorders agents to match savedOrder', () => {
    const result = applySavedAgentOrder([claude, codex, gemini], ['gemini', 'codex', 'claude']);
    expect(result.map((a) => a.backend)).toEqual(['gemini', 'codex', 'claude']);
  });

  it('drops stale keys that no longer match any detected agent', () => {
    const result = applySavedAgentOrder([claude, codex], ['gemini', 'codex', 'claude']);
    expect(result.map((a) => a.backend)).toEqual(['codex', 'claude']);
  });

  it('appends newly-detected agents at the end in backend order', () => {
    const result = applySavedAgentOrder([claude, codex, gemini], ['codex']);
    expect(result.map((a) => a.backend)).toEqual(['codex', 'claude', 'gemini']);
  });

  it('keys remote rows by id, not backend', () => {
    const result = applySavedAgentOrder([claude, remoteOne], ['r-1', 'claude']);
    expect(result.map((a) => a.id ?? a.backend)).toEqual(['r-1', 'claude']);
  });

  it('is idempotent when input already matches savedOrder', () => {
    const ordered = ['codex', 'claude', 'gemini'];
    const once = applySavedAgentOrder([claude, codex, gemini], ordered);
    const twice = applySavedAgentOrder(once, ordered);
    expect(twice.map((a) => a.backend)).toEqual(['codex', 'claude', 'gemini']);
  });
});
