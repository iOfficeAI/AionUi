/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromBackendAssistant,
  fromBackendTeam,
  normalizeTeamStatus,
  toBackendAssistant,
} from '@/common/adapter/teamMapper';

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
    const assistant = fromBackendAssistant({
      slot_id: 'slot-1',
      conversation_id: 'conversation-1',
      role: 'teammate',
      backend: 'claude',
      name: 'Worker',
      status: 'thinking',
    });

    expect(assistant.status).toBe('active');
  });

  it('maps backend agent fields into assistant-first frontend runtime fields', () => {
    const assistant = fromBackendAssistant({
      slot_id: 'slot-1',
      conversation_id: 'conversation-1',
      role: 'teammate',
      assistant_backend: 'codex',
      backend: 'claude',
      assistant_name: 'Writer',
      agent_type: 'claude',
      agent_name: 'Worker',
      status: 'idle',
    });

    expect(assistant.assistant_backend).toBe('codex');
    expect(assistant.assistant_name).toBe('Writer');
    expect(assistant).not.toHaveProperty('agent_type');
    expect(assistant).not.toHaveProperty('agent_name');
  });

  it('prefers assistant-first team response fields while keeping legacy aliases hydrated', () => {
    const team = fromBackendTeam({
      id: 'team-1',
      name: 'Alpha',
      workspace: '/tmp/ws',
      workspace_mode: 'shared',
      leader_assistant_id: 'slot-lead',
      assistants: [
        {
          slot_id: 'slot-lead',
          conversation_id: 'conv-1',
          role: 'leader',
          assistant_backend: 'codex',
          assistant_name: 'Lead',
          status: 'idle',
        },
      ],
      created_at: 1,
      updated_at: 2,
    });

    expect(team.leader_assistant_id).toBe('slot-lead');
    expect(team.leader_agent_id).toBe('slot-lead');
    expect(team.assistants).toHaveLength(1);
    expect(team.agents).toHaveLength(1);
  });

  it('prefers the concrete backend over generic agent_type when hydrating assistant runtime fields', () => {
    const assistant = fromBackendAssistant({
      slot_id: 'slot-1',
      conversation_id: 'conversation-1',
      role: 'teammate',
      backend: 'claude',
      agent_type: 'acp',
      agent_name: 'Worker',
      status: 'idle',
    });

    expect(assistant.assistant_backend).toBe('claude');
    expect(assistant).not.toHaveProperty('conversation_type');
  });

  it('hydrates assistant identity from assistant_id', () => {
    expect(
      fromBackendAssistant({
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
      fromBackendAssistant({
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
      toBackendAssistant({
        role: 'leader',
        assistant_backend: 'aionrs',
        assistant_name: 'Aion CLI',
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
      toBackendAssistant({
        role: 'teammate',
        assistant_backend: 'codex',
        assistant_name: 'Writer',
        status: 'pending',
        assistant_id: 'assistant-writer',
        model: 'gpt-5',
      })
    ).not.toHaveProperty('backend');
  });

  it('rejects new team payloads without assistant identity', () => {
    expect(() =>
      toBackendAssistant({
        role: 'teammate',
        assistant_backend: 'acp',
        assistant_name: 'Legacy Worker',
        status: 'pending',
        model: 'claude',
      })
    ).toThrow('assistant_id is required');
  });
});
