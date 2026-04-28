/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

// Import actual functions from source
import {
  getChannelEnabledSkills,
  buildChannelConversationExtra,
} from '../../src/process/channels/utils/channelConversation';

describe('channelConversation real functions', () => {
  describe('getChannelEnabledSkills', () => {
    it('returns weixin-file-send skill for weixin platform', () => {
      const result = getChannelEnabledSkills('weixin');
      expect(result).toEqual(['weixin-file-send']);
    });

    it('returns undefined for telegram platform', () => {
      const result = getChannelEnabledSkills('telegram');
      expect(result).toBeUndefined();
    });

    it('returns undefined for lark platform', () => {
      const result = getChannelEnabledSkills('lark');
      expect(result).toBeUndefined();
    });

    it('returns undefined for dingtalk platform', () => {
      const result = getChannelEnabledSkills('dingtalk');
      expect(result).toBeUndefined();
    });

    it('returns undefined for wecom platform', () => {
      const result = getChannelEnabledSkills('wecom');
      expect(result).toBeUndefined();
    });
  });

  describe('buildChannelConversationExtra', () => {
    it('returns enabled_skills only for gemini backend with weixin platform', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'gemini',
      });
      expect(result).toEqual({ preset_enabled_skills: ['weixin-file-send'] });
    });

    it('returns enabled_skills only for codex backend with weixin platform', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'codex',
      });
      expect(result).toEqual({ preset_enabled_skills: ['weixin-file-send'] });
    });

    it('returns enabled_skills only for openclaw-gateway backend with weixin platform', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'openclaw-gateway',
      });
      expect(result).toEqual({ preset_enabled_skills: ['weixin-file-send'] });
    });

    it('returns empty object for gemini backend with non-weixin platform', () => {
      const result = buildChannelConversationExtra({
        platform: 'telegram',
        backend: 'gemini',
      });
      expect(result).toEqual({});
    });

    it('returns full extra for ACP backend (claude) with customAgentId and agentName', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'claude',
        custom_agent_id: 'agent-123',
        agent_name: 'Claude Assistant',
      });
      expect(result).toEqual({
        backend: 'claude',
        custom_agent_id: 'agent-123',
        agent_name: 'Claude Assistant',
        preset_enabled_skills: ['weixin-file-send'],
      });
    });

    it('returns full extra for ACP backend without customAgentId', () => {
      const result = buildChannelConversationExtra({
        platform: 'telegram',
        backend: 'claude',
      });
      expect(result).toEqual({
        backend: 'claude',
        custom_agent_id: undefined,
        agent_name: undefined,
      });
    });

    it('handles unknown backend as ACP type', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'unknown-backend',
        custom_agent_id: 'custom-1',
        agent_name: 'Custom Agent',
      });
      expect(result).toEqual({
        backend: 'unknown-backend',
        custom_agent_id: 'custom-1',
        agent_name: 'Custom Agent',
        preset_enabled_skills: ['weixin-file-send'],
      });
    });

    it('handles lark platform with gemini backend', () => {
      const result = buildChannelConversationExtra({
        platform: 'lark',
        backend: 'gemini',
      });
      expect(result).toEqual({});
    });

    it('handles dingtalk platform with codex backend', () => {
      const result = buildChannelConversationExtra({
        platform: 'dingtalk',
        backend: 'codex',
      });
      expect(result).toEqual({});
    });

    it('handles weixin platform with claude backend', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'claude',
      });
      expect(result).toEqual({
        backend: 'claude',
        custom_agent_id: undefined,
        agent_name: undefined,
        preset_enabled_skills: ['weixin-file-send'],
      });
    });

    it('handles empty strings for optional parameters', () => {
      const result = buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'claude',
        custom_agent_id: '',
        agent_name: '',
      });
      expect(result).toEqual({
        backend: 'claude',
        custom_agent_id: '',
        agent_name: '',
        preset_enabled_skills: ['weixin-file-send'],
      });
    });
  });
});
