/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromBackendAdHocTeamAssociationOptional,
  fromBackendAdHocTeamCreateResult,
  toBackendAdHocTeamFromConversationParams,
} from '@/common/adapter/adHocTeamBridge';

describe('adHocTeamMapper', () => {
  describe('toBackendAdHocTeamFromConversationParams', () => {
    it('maps required fields', () => {
      const result = toBackendAdHocTeamFromConversationParams({
        conversation_id: 'conv-1',
        user_id: 'user-1',
        target_assistant_id: 'asst-1',
      });

      expect(result).toEqual({
        conversation_id: 'conv-1',
        user_id: 'user-1',
        target_assistant_id: 'asst-1',
      });
    });

    it('includes optional name and workspace_mode when provided', () => {
      const result = toBackendAdHocTeamFromConversationParams({
        conversation_id: 'conv-1',
        user_id: 'user-1',
        target_assistant_id: 'asst-1',
        name: 'My Ad-hoc Team',
        workspace_mode: 'isolated',
      });

      expect(result).toEqual({
        conversation_id: 'conv-1',
        user_id: 'user-1',
        target_assistant_id: 'asst-1',
        name: 'My Ad-hoc Team',
        workspace_mode: 'isolated',
      });
    });
  });

  describe('fromBackendAdHocTeamCreateResult', () => {
    it('maps create result fields', () => {
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

    it('defaults created to false and strings to empty', () => {
      const result = fromBackendAdHocTeamCreateResult({});

      expect(result).toEqual({
        team_id: '',
        origin_conversation_id: '',
        leader_slot_id: '',
        target_slot_id: '',
        created: false,
      });
    });
  });

  describe('fromBackendAdHocTeamAssociationOptional', () => {
    it('returns null for nullish input', () => {
      expect(fromBackendAdHocTeamAssociationOptional(null)).toBeNull();
      expect(fromBackendAdHocTeamAssociationOptional(undefined)).toBeNull();
    });

    it('maps association without team payload', () => {
      const result = fromBackendAdHocTeamAssociationOptional({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'active',
      });

      expect(result).toEqual({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'active',
      });
    });

    it('maps association with team payload', () => {
      const result = fromBackendAdHocTeamAssociationOptional({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'active',
        team: {
          id: 'team-1',
          user_id: 'user-1',
          name: 'Ad-hoc Team',
          workspace: '/tmp/ws',
          workspace_mode: 'shared',
          leader_assistant_id: 'slot-lead',
          assistants: [
            {
              slot_id: 'slot-lead',
              conversation_id: 'conv-lead',
              role: 'leader',
              assistant_backend: 'codex',
              assistant_name: 'Lead',
              status: 'idle',
            },
          ],
          origin_conversation_id: 'conv-1',
          created_at: 1,
          updated_at: 2,
        },
      });

      expect(result).toMatchObject({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'active',
      });
      expect(result?.team).toMatchObject({
        id: 'team-1',
        name: 'Ad-hoc Team',
        origin_conversation_id: 'conv-1',
      });
      expect(result?.team?.assistants).toHaveLength(1);
    });

    it('falls back to active for unknown status', () => {
      const result = fromBackendAdHocTeamAssociationOptional({
        team_id: 'team-1',
        origin_conversation_id: 'conv-1',
        status: 'unknown-status',
      });

      expect(result?.status).toBe('active');
    });
  });
});
