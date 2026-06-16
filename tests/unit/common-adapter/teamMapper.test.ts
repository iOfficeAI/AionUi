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

  it('hydrates assistant identity from either assistant_id or legacy custom_agent_id', () => {
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

    expect(
      fromBackendAgent({
        slot_id: 'slot-2',
        conversation_id: 'conversation-2',
        role: 'teammate',
        backend: 'aionrs',
        name: 'Worker',
        custom_agent_id: 'assistant-legacy',
      }).assistant_id
    ).toBe('assistant-legacy');
  });

  it('prefers assistant_id over legacy custom_agent_id when both are present', () => {
    expect(
      fromBackendAgent({
        slot_id: 'slot-3',
        conversation_id: 'conversation-3',
        role: 'teammate',
        backend: 'aionrs',
        name: 'Worker',
        assistant_id: 'assistant-modern',
        custom_agent_id: 'assistant-legacy',
      }).assistant_id
    ).toBe('assistant-modern');
  });

  it('does not expose legacy custom_agent_id on the frontend team agent shape', () => {
    const agent = fromBackendAgent({
      slot_id: 'slot-2',
      conversation_id: 'conversation-2',
      role: 'teammate',
      backend: 'aionrs',
      name: 'Worker',
      custom_agent_id: 'assistant-legacy',
    });

    expect(agent.assistant_id).toBe('assistant-legacy');
    expect(agent).not.toHaveProperty('custom_agent_id');
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
      backend: 'aionrs',
      name: 'Aion CLI',
      assistant_id: 'assistant-1',
    });
  });
});
