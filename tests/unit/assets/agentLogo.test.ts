/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAgentLogo,
  resolveAgentLogo,
  hasAgentLogo,
  isDefaultModel,
  getModelDisplayLabel,
} from '@/renderer/utils/model/agentLogo';

vi.mock('@/renderer/utils/platform', () => ({
  resolveBackendAssetUrl: (url: string) => url,
}));

describe('agentLogo', () => {
  let originalDocument: Document | undefined;

  beforeEach(() => {
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

  describe('getAgentLogo', () => {
    it('returns logo path for known agent (case-insensitive)', () => {
      const logo = getAgentLogo('Claude');
      expect(logo).toContain('/api/assets/logos/ai-major/claude.svg');
    });

    it('returns logo for lowercase input', () => {
      const logo = getAgentLogo('gemini');
      expect(logo).toContain('/api/assets/logos/ai-major/gemini.svg');
    });

    it('returns null for unknown agent', () => {
      expect(getAgentLogo('unknown-agent')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(getAgentLogo(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(getAgentLogo(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getAgentLogo('')).toBeNull();
    });

    it('returns logo for multi-variant agents', () => {
      const logo1 = getAgentLogo('openclaw-gateway');
      const logo2 = getAgentLogo('openclaw');
      expect(logo1).toContain('openclaw.svg');
      expect(logo2).toContain('openclaw.svg');
    });

    it('applies dark theme variant for opencode', () => {
      (global.document.documentElement.getAttribute as any).mockReturnValue('dark');
      const logo = getAgentLogo('opencode');
      expect(logo).toContain('opencode-dark.svg');
    });
  });

  describe('resolveAgentLogo', () => {
    it('prioritizes explicit icon', () => {
      const result = resolveAgentLogo({
        icon: '/custom/icon.svg',
        backend: 'claude',
      });
      expect(result).toContain('/custom/icon.svg');
    });

    it('falls back to backend ID', () => {
      const result = resolveAgentLogo({
        backend: 'gemini',
      });
      expect(result).toContain('gemini.svg');
    });

    it('extracts adapter ID from custom_agent_id for extensions', () => {
      const result = resolveAgentLogo({
        isExtension: true,
        custom_agent_id: 'ext:my-ext:claude',
      });
      expect(result).toContain('claude.svg');
    });

    it('returns null when no match found', () => {
      const result = resolveAgentLogo({
        backend: 'unknown',
      });
      expect(result).toBeNull();
    });
  });

  describe('hasAgentLogo', () => {
    it('returns true for known agent', () => {
      expect(hasAgentLogo('claude')).toBe(true);
    });

    it('returns false for unknown agent', () => {
      expect(hasAgentLogo('unknown')).toBe(false);
    });

    it('returns false for null', () => {
      expect(hasAgentLogo(null)).toBe(false);
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

    it('returns defaultModelLabel when selectedLabel contains default keyword', () => {
      const result = getModelDisplayLabel({
        selected_value: 'gpt-4',
        selectedLabel: 'GPT-4 (default)',
        defaultModelLabel: 'Default Model',
        fallbackLabel: 'Unknown',
      });
      expect(result).toBe('Default Model');
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
