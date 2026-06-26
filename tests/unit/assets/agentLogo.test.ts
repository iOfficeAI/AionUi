/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentLogoMap } from '@/renderer/utils/model/agentLogo';
import {
  fetchAgentLogos,
  resolveAgentAvatar,
  resolveAgentLogo,
  isDefaultModel,
  getModelDisplayLabel,
} from '@/renderer/utils/model/agentLogo';

const bridgeMocks = vi.hoisted(() => ({
  getManagedAgents: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getManagedAgents: { invoke: bridgeMocks.getManagedAgents },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (url: string) => url,
}));

// Backend logo catalog returned by `useAgentLogos()` in production. The unit
// test passes it explicitly to the pure `resolveAgentLogo`.
const LOGOS: AgentLogoMap = {
  claude: '/api/assets/logos/ai-major/claude.svg',
  emojiagent: '🧠',
  gemini: '/api/assets/logos/ai-major/gemini.svg',
  opencode: '/api/assets/logos/tools/coding/opencode-light.svg',
  'openclaw-gateway': '/api/assets/logos/tools/openclaw.svg',
};

describe('agentLogo', () => {
  let originalDocument: Document | undefined;

  beforeEach(() => {
    bridgeMocks.getManagedAgents.mockReset();
    if (typeof document !== 'undefined') {
      originalDocument = document;
    }
    global.document = {
      documentElement: {
        getAttribute: vi.fn(() => 'light'),
      },
    } as any;
  });

  afterEach(() => {
    if (originalDocument) {
      global.document = originalDocument as any;
    }
  });

  describe('resolveAgentLogo (backend lookup)', () => {
    it('returns logo path for known backend (case-insensitive)', () => {
      expect(resolveAgentLogo(LOGOS, { backend: 'Claude' })).toContain('/api/assets/logos/ai-major/claude.svg');
    });

    it('returns logo for lowercase input', () => {
      expect(resolveAgentLogo(LOGOS, { backend: 'gemini' })).toContain('/api/assets/logos/ai-major/gemini.svg');
    });

    it('returns null for unknown backend', () => {
      expect(resolveAgentLogo(LOGOS, { backend: 'unknown-agent' })).toBeNull();
    });

    it('returns null for null/undefined/empty backend', () => {
      expect(resolveAgentLogo(LOGOS, { backend: null })).toBeNull();
      expect(resolveAgentLogo(LOGOS, { backend: undefined })).toBeNull();
      expect(resolveAgentLogo(LOGOS, { backend: '' })).toBeNull();
    });

    it('tolerates a missing catalog map', () => {
      expect(resolveAgentLogo(undefined as unknown as AgentLogoMap, { backend: 'claude' })).toBeNull();
    });

    it('uses the backend-provided opencode logo without applying a theme variant', () => {
      (global.document.documentElement.getAttribute as any).mockReturnValue('dark');
      expect(resolveAgentLogo(LOGOS, { backend: 'opencode' })).toContain('opencode-light.svg');
    });

    it('does not expose local absolute paths as logo sources', () => {
      expect(resolveAgentLogo(LOGOS, { icon: '/Users/demo/.aionui/agent-avatars/custom.png' })).toBeNull();
    });
  });

  describe('resolveAgentAvatar', () => {
    it('keeps explicit emoji avatars as emoji', () => {
      expect(resolveAgentAvatar(LOGOS, { icon: '🧠', backend: 'claude' })).toEqual({
        kind: 'emoji',
        value: '🧠',
      });
    });

    it('falls back to backend catalog logos when explicit local paths leak through', () => {
      expect(
        resolveAgentAvatar(LOGOS, { icon: '/Users/demo/.aionui/agent-avatars/custom.png', backend: 'claude' })
      ).toEqual({
        kind: 'image',
        value: '/api/assets/logos/ai-major/claude.svg',
      });
    });

    it('keeps backend catalog emoji avatars as emoji', () => {
      expect(resolveAgentAvatar(LOGOS, { backend: 'emojiagent' })).toEqual({
        kind: 'emoji',
        value: '🧠',
      });
    });
  });

  describe('fetchAgentLogos', () => {
    it('builds the logo catalog from /api/agents/management rows', async () => {
      bridgeMocks.getManagedAgents.mockResolvedValue([
        {
          id: 'agent-claude',
          name: 'Claude',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'claude',
          enabled: true,
          installed: true,
          status: 'online',
          icon: '/api/assets/logos/ai-major/claude.svg',
        },
      ]);

      await expect(fetchAgentLogos()).resolves.toEqual({
        acp: '/api/assets/logos/ai-major/claude.svg',
        'agent-claude': '/api/assets/logos/ai-major/claude.svg',
        claude: '/api/assets/logos/ai-major/claude.svg',
      });
      expect(bridgeMocks.getManagedAgents).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveAgentLogo (priority)', () => {
    it('prioritizes explicit icon', () => {
      expect(resolveAgentLogo(LOGOS, { icon: '/api/custom/icon.svg', backend: 'claude' })).toContain(
        '/api/custom/icon.svg'
      );
    });

    it('falls back to backend ID', () => {
      expect(resolveAgentLogo(LOGOS, { backend: 'gemini' })).toContain('gemini.svg');
    });

    it('extracts adapter ID from custom_agent_id for extensions', () => {
      expect(resolveAgentLogo(LOGOS, { isExtension: true, custom_agent_id: 'ext:my-ext:claude' })).toContain(
        'claude.svg'
      );
    });

    it('returns null when no match found', () => {
      expect(resolveAgentLogo(LOGOS, { backend: 'unknown' })).toBeNull();
    });
  });

  describe('isDefaultModel', () => {
    it('returns true when value contains default', () => {
      expect(isDefaultModel('gpt-4-default', null)).toBe(true);
    });

    it('returns true when label contains recommended', () => {
      expect(isDefaultModel(null, 'recommended model')).toBe(true);
    });

    it('returns true when text contains 默认', () => {
      expect(isDefaultModel('', '默认模型')).toBe(true);
    });

    it('returns false when no keywords present', () => {
      expect(isDefaultModel('gpt-4', 'GPT-4')).toBe(false);
    });

    it('handles null inputs', () => {
      expect(isDefaultModel(null, null)).toBe(false);
    });
  });

  describe('getModelDisplayLabel', () => {
    it('returns selectedLabel when provided and not default', () => {
      const result = getModelDisplayLabel({
        selected_value: 'gpt-4',
        selectedLabel: 'GPT-4 Turbo',
        defaultModelLabel: 'Default',
        fallbackLabel: 'Unknown',
      });
      expect(result).toBe('GPT-4 Turbo');
    });

    it('keeps a specific model label even when it includes the default tier suffix', () => {
      const result = getModelDisplayLabel({
        selected_value: 'gpt-4',
        selectedLabel: 'GPT-4 (default)',
        defaultModelLabel: 'Default Model',
        fallbackLabel: 'Unknown',
      });
      expect(result).toBe('GPT-4 (default)');
    });

    it('keeps a generic default option label unchanged', () => {
      const result = getModelDisplayLabel({
        selected_value: 'default/default',
        selectedLabel: 'Default (default)',
        defaultModelLabel: 'Default Model',
        fallbackLabel: 'Unknown',
      });
      expect(result).toBe('Default (default)');
    });

    it('falls back to fallbackLabel when selectedLabel is null', () => {
      const result = getModelDisplayLabel({
        selected_value: 'gpt-4',
        selectedLabel: null,
        defaultModelLabel: 'Default',
        fallbackLabel: 'Unnamed Model',
      });
      expect(result).toBe('Unnamed Model');
    });

    it('returns fallbackLabel when selectedLabel is empty', () => {
      const result = getModelDisplayLabel({
        selected_value: 'gpt-4',
        selectedLabel: '',
        defaultModelLabel: 'Default',
        fallbackLabel: 'Fallback',
      });
      expect(result).toBe('Fallback');
    });
  });
});
