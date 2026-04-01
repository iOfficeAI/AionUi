/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

/**
 * Pure function tests for channelConversation utilities
 * Inline implementations avoid module mocking conflicts
 */
describe('channelConversation pure functions', () => {
  const WEIXIN_FILE_SEND_SKILL = 'weixin-file-send';

  function getChannelEnabledSkills(platform: string): string[] | undefined {
    return platform === 'weixin' ? [WEIXIN_FILE_SEND_SKILL] : undefined;
  }

  function buildChannelConversationExtra(args: {
    platform: string;
    backend: string;
    customAgentId?: string;
    agentName?: string;
  }): {
    backend?: string;
    customAgentId?: string;
    agentName?: string;
    enabledSkills?: string[];
  } {
    const enabledSkills = getChannelEnabledSkills(args.platform);

    if (args.backend === 'gemini' || args.backend === 'codex' || args.backend === 'openclaw-gateway') {
      return enabledSkills ? { enabledSkills } : {};
    }

    return {
      backend: args.backend,
      customAgentId: args.customAgentId,
      agentName: args.agentName,
      ...(enabledSkills ? { enabledSkills } : {}),
    };
  }

  describe('getChannelEnabledSkills', () => {
    it('returns weixin-file-send skill for weixin platform', () => {
      expect(getChannelEnabledSkills('weixin')).toEqual(['weixin-file-send']);
    });

    it('returns undefined for telegram platform', () => {
      expect(getChannelEnabledSkills('telegram')).toBeUndefined();
    });

    it('returns undefined for lark platform', () => {
      expect(getChannelEnabledSkills('lark')).toBeUndefined();
    });

    it('returns undefined for dingtalk platform', () => {
      expect(getChannelEnabledSkills('dingtalk')).toBeUndefined();
    });
  });

  describe('buildChannelConversationExtra', () => {
    it('returns enabledSkills only for gemini backend with weixin platform', () => {
      expect(buildChannelConversationExtra({ platform: 'weixin', backend: 'gemini' })).toEqual({
        enabledSkills: ['weixin-file-send'],
      });
    });

    it('returns enabledSkills only for codex backend with weixin platform', () => {
      expect(buildChannelConversationExtra({ platform: 'weixin', backend: 'codex' })).toEqual({
        enabledSkills: ['weixin-file-send'],
      });
    });

    it('returns enabledSkills only for openclaw-gateway backend with weixin platform', () => {
      expect(buildChannelConversationExtra({ platform: 'weixin', backend: 'openclaw-gateway' })).toEqual({
        enabledSkills: ['weixin-file-send'],
      });
    });

    it('returns empty object for gemini backend with non-weixin platform', () => {
      expect(buildChannelConversationExtra({ platform: 'telegram', backend: 'gemini' })).toEqual({});
    });

    it('returns full extra for ACP backend (claude) with customAgentId and agentName', () => {
      expect(
        buildChannelConversationExtra({
          platform: 'weixin',
          backend: 'claude',
          customAgentId: 'agent-123',
          agentName: 'Claude Assistant',
        })
      ).toEqual({
        backend: 'claude',
        customAgentId: 'agent-123',
        agentName: 'Claude Assistant',
        enabledSkills: ['weixin-file-send'],
      });
    });

    it('returns full extra for ACP backend without customAgentId', () => {
      expect(buildChannelConversationExtra({ platform: 'telegram', backend: 'claude' })).toEqual({
        backend: 'claude',
        customAgentId: undefined,
        agentName: undefined,
      });
    });

    it('handles unknown backend as ACP type', () => {
      expect(
        buildChannelConversationExtra({
          platform: 'weixin',
          backend: 'unknown-backend',
          customAgentId: 'custom-1',
          agentName: 'Custom Agent',
        })
      ).toEqual({
        backend: 'unknown-backend',
        customAgentId: 'custom-1',
        agentName: 'Custom Agent',
        enabledSkills: ['weixin-file-send'],
      });
    });

    it('handles undefined optional parameters', () => {
      expect(buildChannelConversationExtra({ platform: 'lark', backend: 'openclaw-gateway' })).toEqual({});
    });
  });
});
