/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { fromBackendAgent, normalizeTeamStatus, toBackendAgent } from '@/common/adapter/teamMapper';

describe('teamMapper', () => {
  describe('normalizeTeamStatus', () => {
    it.each([
      ['pending', 'pending'],
      ['idle', 'idle'],
      ['working', 'active'],
      ['thinking', 'active'],
      ['tool_use', 'active'],
      ['completed', 'completed'],
      ['error', 'failed'],
      ['unknown', 'idle'],
      [undefined, 'idle'],
    ] as const)('maps backend status %s to UI status %s', (raw, expected) => {
      expect(normalizeTeamStatus(raw)).toBe(expected);
    });
  });

  it('uses normalized status when mapping backend agents', () => {
    const agent = fromBackendAgent({
      slot_id: 'slot-1',
      conversation_id: 'conversation-1',
      role: 'teammate',
      backend: 'claude',
      name: 'Worker',
      status: 'thinking',
    });

    expect(agent.status).toBe('active');
  });

  it('maps backend agent fields into assistant-first frontend runtime fields', () => {
    const agent = fromBackendAgent({
      slot_id: 'slot-1',
      conversation_id: 'conversation-1',
      role: 'teammate',
      backend: 'claude',
      agent_type: 'claude',
      agent_name: 'Worker',
      status: 'idle',
    });

    expect(agent.assistant_backend).toBe('claude');
    expect(agent.assistant_name).toBe('Worker');
    expect(agent).not.toHaveProperty('agent_type');
    expect(agent).not.toHaveProperty('agent_name');
  });

  it('prefers the concrete backend over generic agent_type when hydrating assistant runtime fields', () => {
    const agent = fromBackendAgent({
      slot_id: 'slot-1',
      conversation_id: 'conversation-1',
      role: 'teammate',
      backend: 'claude',
      agent_type: 'acp',
      agent_name: 'Worker',
      status: 'idle',
    });

    expect(agent.assistant_backend).toBe('claude');
    expect(agent.conversation_type).toBe('acp');
  });

  it('hydrates assistant identity from assistant_id', () => {
    expect(
      fromBackendAgent({
        slot_id: 'slot-1',
        conversation_id: 'conversation-1',
        role: 'teammate',
        backend: 'aionrs',
        name: 'Worker',
        assistant_id: 'assistant-1',
      }).assistant_id
    ).toBe('assistant-1');
  });

  it('ignores legacy custom_agent_id when assistant_id is absent from the backend payload', () => {
    expect(
      fromBackendAgent({
        slot_id: 'slot-2',
        conversation_id: 'conversation-2',
        role: 'teammate',
        backend: 'aionrs',
        name: 'Worker',
        custom_agent_id: 'assistant-legacy',
      }).assistant_id
    ).toBeUndefined();
  });

  it('preserves assistant identity when serializing agents back to the backend payload', () => {
    expect(
      toBackendAgent({
        role: 'leader',
        assistant_backend: 'aionrs',
        assistant_name: 'Aion CLI',
        conversation_type: 'aionrs',
        status: 'pending',
        assistant_id: 'assistant-1',
      })
    ).toMatchObject({
      name: 'Aion CLI',
      assistant_id: 'assistant-1',
    });
  });

  it('omits backend for new assistant-led payloads so the backend can derive it from assistant identity', () => {
    expect(
      toBackendAgent({
        role: 'teammate',
        assistant_backend: 'codex',
        assistant_name: 'Writer',
        conversation_type: 'acp',
        status: 'pending',
        assistant_id: 'assistant-writer',
        model: 'gpt-5',
      })
    ).not.toHaveProperty('backend');
  });

  it('rejects new team payloads without assistant identity', () => {
    expect(() =>
      toBackendAgent({
        role: 'teammate',
        assistant_backend: 'acp',
        assistant_name: 'Legacy Worker',
        conversation_type: 'acp',
        status: 'pending',
        model: 'claude',
      })
    ).toThrow('assistant_id is required');
  });
});
