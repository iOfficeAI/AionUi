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

  it('preserves assistant identity when serializing agents back to the backend payload', () => {
    expect(
      toBackendAgent({
        role: 'leader',
        agent_type: 'aionrs',
        agent_name: 'Aion CLI',
        conversation_type: 'aionrs',
        status: 'pending',
        assistant_id: 'assistant-1',
        custom_agent_id: 'assistant-1',
      })
    ).toMatchObject({
      backend: 'aionrs',
      assistant_id: 'assistant-1',
    });
  });
});
