/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromBackendAdHocTeamAssociationOptional,
  fromBackendAdHocTeamCreateResult,
} from '@/common/adapter/adHocTeamBridge';
import {
  fromBackendAssistant,
  fromBackendTeam,
  fromBackendTeamList,
  fromBackendTeamOptional,
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
      ['dormant', 'dormant'],
      ['unknown', 'idle'],
      [undefined, 'idle'],
    ] as const)('maps backend status %s to UI status %s', (raw, expected) => {
      expect(normalizeTeamStatus(raw)).toBe(expected);
    });

    it('passes dormant through without collapsing to idle', () => {
      expect(normalizeTeamStatus('dormant')).toBe('dormant');
      expect(normalizeTeamStatus('idle')).toBe('idle');
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
      role: 'lead',
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

  describe('fromBackendAssistant edge cases', () => {
    it('maps backend role "lead" to frontend "leader"', () => {
      const assistant = fromBackendAssistant({ role: 'lead', assistant_name: 'Lead' });
      expect(assistant.role).toBe('leader');
    });

    it('falls back to "teammate" for unknown roles', () => {
      const assistant = fromBackendAssistant({ role: 'unknown', assistant_name: 'X' });
      expect(assistant.role).toBe('teammate');
    });

    it('hydrates defaults when raw payload is empty', () => {
      const assistant = fromBackendAssistant({});
      expect(assistant.slot_id).toBe('');
      expect(assistant.conversation_id).toBe('');
      expect(assistant.role).toBe('teammate');
      expect(assistant.assistant_backend).toBe('');
      expect(assistant.assistant_name).toBe('');
      expect(assistant.status).toBe('idle');
      expect(assistant.pending_confirmations).toBe(0);
    });

    it('prefers assistant_name over agent_name and name', () => {
      const assistant = fromBackendAssistant({
        assistant_name: 'First',
        agent_name: 'Second',
        name: 'Third',
      });
      expect(assistant.assistant_name).toBe('First');
    });

    it('uses agent_name when assistant_name is absent', () => {
      const assistant = fromBackendAssistant({ agent_name: 'Second', name: 'Third' });
      expect(assistant.assistant_name).toBe('Second');
    });

    it('uses name as final fallback for assistant_name', () => {
      const assistant = fromBackendAssistant({ name: 'Third' });
      expect(assistant.assistant_name).toBe('Third');
    });

    it('reads pending_confirmations from camelCase alias', () => {
      const assistant = fromBackendAssistant({ pendingConfirmations: 7 });
      expect(assistant.pending_confirmations).toBe(7);
    });
  });

  describe('fromBackendTeam edge cases', () => {
    it('preserves origin_conversation_id', () => {
      const team = fromBackendTeam({ id: 'team-1', origin_conversation_id: 'conv-origin' });
      expect(team.origin_conversation_id).toBe('conv-origin');
    });

    it('falls back to agents array when assistants is missing', () => {
      const team = fromBackendTeam({
        id: 'team-1',
        agents: [{ slot_id: 'slot-1', role: 'teammate', assistant_name: 'Agent' }],
      });
      expect(team.assistants).toHaveLength(1);
      expect(team.agents).toHaveLength(1);
    });

    it('prefers leader_assistant_id over leader_agent_id', () => {
      const team = fromBackendTeam({
        id: 'team-1',
        leader_assistant_id: 'lead-1',
        leader_agent_id: 'lead-2',
      });
      expect(team.leader_assistant_id).toBe('lead-1');
      expect(team.leader_agent_id).toBe('lead-1');
    });

    it('uses leader_agent_id when leader_assistant_id is absent', () => {
      const team = fromBackendTeam({ id: 'team-1', leader_agent_id: 'lead-2' });
      expect(team.leader_assistant_id).toBe('lead-2');
      expect(team.leader_agent_id).toBe('lead-2');
    });

    it('defaults workspace_mode to shared for invalid values', () => {
      const team = fromBackendTeam({ id: 'team-1', workspace_mode: 'invalid' });
      expect(team.workspace_mode).toBe('shared');
    });

    it('returns empty arrays when neither assistants nor agents are provided', () => {
      const team = fromBackendTeam({ id: 'team-1' });
      expect(team.assistants).toHaveLength(0);
      expect(team.agents).toHaveLength(0);
    });
  });

  describe('fromBackendTeamList and fromBackendTeamOptional', () => {
    it('preserves multiple teams with the same display name', () => {
      const list = fromBackendTeamList([
        { id: 'team-1', name: 'Ad-hoc Team' },
        { id: 'team-2', name: 'Ad-hoc Team' },
        { id: 'team-3', name: 'Ad-hoc Team' },
      ]);

      expect(list.map((team) => team.id)).toEqual(['team-1', 'team-2', 'team-3']);
    });

    it('maps an array of raw teams', () => {
      const list = fromBackendTeamList([{ id: 'team-1' }, { id: 'team-2' }]);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('team-1');
    });

    it('returns empty array for non-array input', () => {
      expect(fromBackendTeamList(undefined)).toHaveLength(0);
      expect(fromBackendTeamList(null)).toHaveLength(0);
      expect(fromBackendTeamList('team')).toHaveLength(0);
    });

    it('returns null for nullish optional input', () => {
      expect(fromBackendTeamOptional(null)).toBeNull();
      expect(fromBackendTeamOptional(undefined)).toBeNull();
    });
  });

  describe('fromBackendAdHocTeamCreateResult', () => {
    it('maps all result fields with defaults', () => {
      const result = fromBackendAdHocTeamCreateResult({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        leader_slot_id: 'slot-lead',
        target_slot_id: 'slot-target',
        created: true,
      });
      expect(result).toEqual({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        leader_slot_id: 'slot-lead',
        target_slot_id: 'slot-target',
        created: true,
      });
    });

    it('uses empty defaults for missing fields', () => {
      const result = fromBackendAdHocTeamCreateResult({});
      expect(result.team_id).toBe('');
      expect(result.origin_conversation_id).toBe('');
      expect(result.created).toBe(false);
    });
  });

  describe('fromBackendAdHocTeamAssociationOptional', () => {
    it('returns null for nullish input', () => {
      expect(fromBackendAdHocTeamAssociationOptional(null)).toBeNull();
      expect(fromBackendAdHocTeamAssociationOptional(undefined)).toBeNull();
    });

    it('includes nested team when provided', () => {
      const association = fromBackendAdHocTeamAssociationOptional({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'active',
        team: { id: 'team-1', name: 'Alpha' },
      });
      expect(association?.team_id).toBe('team-1');
      expect(association?.team?.name).toBe('Alpha');
    });

    it('falls back to active when status is invalid', () => {
      const association = fromBackendAdHocTeamAssociationOptional({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'unknown',
      });
      expect(association?.status).toBe('active');
    });

    it('preserves disbanded status', () => {
      const association = fromBackendAdHocTeamAssociationOptional({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'disbanded',
      });
      expect(association?.status).toBe('disbanded');
    });
  });
});
