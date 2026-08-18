/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromBackendTeamPreset,
  fromBackendTeamPresetList,
  fromBackendTeamPresetMember,
  toBackendCreateTeamPresetInput,
  toBackendUpdateTeamPresetInput,
} from '@/common/adapter/teamPresetBridge';

describe('teamPresetBridge', () => {
  describe('fromBackendTeamPresetMember', () => {
    it('maps member fields with legacy fallbacks', () => {
      const member = fromBackendTeamPresetMember({
        backend: 'codex',
        name: 'Writer',
        role: 'teammate',
        order: 2,
      });

      expect(member).toEqual({
        assistant_backend: 'codex',
        assistant_id: undefined,
        model: undefined,
        assistant_name: 'Writer',
        role: 'teammate',
        order: 2,
      });
    });

    it('hydrates defaults for empty payloads', () => {
      const member = fromBackendTeamPresetMember({});
      expect(member.assistant_backend).toBe('');
      expect(member.assistant_name).toBe('');
      expect(member.order).toBe(0);
    });
  });

  describe('fromBackendTeamPreset', () => {
    it('converts numeric timestamps to ISO strings', () => {
      const preset = fromBackendTeamPreset({
        id: 'preset-1',
        user_id: 'user-1',
        name: 'Review Team',
        leader: { backend: 'claude', name: 'Lead', role: 'leader' },
        members: [],
        created_at: 1700000000000,
        updated_at: 1700000001000,
      });

      expect(preset.id).toBe('preset-1');
      expect(preset.created_at).toBe(new Date(1700000000000).toISOString());
      expect(preset.updated_at).toBe(new Date(1700000001000).toISOString());
      expect(preset.version).toBe(1);
    });

    it('defaults list fields to empty arrays', () => {
      const preset = fromBackendTeamPreset({ id: 'preset-2' });
      expect(preset.expertise_tags).toEqual([]);
      expect(preset.example_prompts).toEqual([]);
      expect(preset.members).toEqual([]);
    });
  });

  describe('fromBackendTeamPresetList', () => {
    it('returns empty array for non-array input', () => {
      expect(fromBackendTeamPresetList(undefined)).toEqual([]);
      expect(fromBackendTeamPresetList(null)).toEqual([]);
      expect(fromBackendTeamPresetList('preset')).toEqual([]);
    });
  });

  describe('toBackendCreateTeamPresetInput', () => {
    it('serializes required fields and omits absent optionals', () => {
      const body = toBackendCreateTeamPresetInput({
        user_id: 'user-1',
        name: 'Review Team',
        description: 'Reviews code',
        expertise_tags: ['review'],
        example_prompts: ['review this'],
        leader: {
          assistant_backend: 'claude',
          assistant_name: 'Lead',
          role: 'leader',
          order: 0,
        },
        members: [],
      });

      expect(body).toEqual({
        name: 'Review Team',
        description: 'Reviews code',
        expertise_tags: ['review'],
        example_prompts: ['review this'],
        leader: {
          assistant_backend: 'claude',
          assistant_name: 'Lead',
          role: 'leader',
          order: 0,
        },
        members: [],
      });
      expect(body).not.toHaveProperty('icon');
      expect(body).not.toHaveProperty('user_id');
    });
  });

  describe('toBackendUpdateTeamPresetInput', () => {
    it('only includes provided fields', () => {
      const body = toBackendUpdateTeamPresetInput({
        id: 'preset-1',
        input: { name: 'Renamed' },
      });

      expect(body).toEqual({ name: 'Renamed' });
    });
  });
});
