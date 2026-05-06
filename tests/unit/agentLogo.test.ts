// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAgentLogo, resolveAgentLogo } from '../../src/renderer/utils/model/agentLogo';

type TestWindow = Window & { electronAPI?: object; __backendPort?: number };

describe('agentLogo', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    delete (window as TestWindow).electronAPI;
    delete (window as TestWindow).__backendPort;
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    delete (window as TestWindow).electronAPI;
    delete (window as TestWindow).__backendPort;
  });

  describe('getAgentLogo', () => {
    it('returns backend asset paths for known backends (case-insensitive)', () => {
      expect(getAgentLogo('claude')).toBe('/api/assets/logos/ai-major/claude.svg');
      expect(getAgentLogo('Claude')).toBe('/api/assets/logos/ai-major/claude.svg');
      expect(getAgentLogo('CLAUDE')).toBe('/api/assets/logos/ai-major/claude.svg');
    });

    it('returns null for unknown backends', () => {
      expect(getAgentLogo('unknown')).toBeNull();
      expect(getAgentLogo('custom')).toBeNull();
    });

    it('returns null for nullish values', () => {
      expect(getAgentLogo(null)).toBeNull();
      expect(getAgentLogo(undefined)).toBeNull();
    });

    it('resolves backend-relative paths against the backend origin in Electron', () => {
      (window as TestWindow).electronAPI = {};
      (window as TestWindow).__backendPort = 18181;

      expect(getAgentLogo('claude')).toBe('http://127.0.0.1:18181/api/assets/logos/ai-major/claude.svg');
    });

    it('switches opencode to the dark asset when dark mode is active', () => {
      document.documentElement.setAttribute('data-theme', 'dark');

      expect(getAgentLogo('opencode')).toBe('/api/assets/logos/tools/coding/opencode-dark.svg');
    });
  });

  describe('resolveAgentLogo', () => {
    it('returns icon when provided (highest priority)', () => {
      expect(resolveAgentLogo({ icon: '/my/icon.png', backend: 'claude' })).toBe('/my/icon.png');
    });

    it('extracts adapter ID from customAgentId for extension agents', () => {
      const logo = resolveAgentLogo({
        backend: 'custom',
        custom_agent_id: 'ext:aionext-claude:claude',
        isExtension: true,
      });
      expect(logo).toBe('/api/assets/logos/ai-major/claude.svg');
    });

    it('falls back to backend logo when not an extension', () => {
      expect(resolveAgentLogo({ backend: 'gemini' })).toBe('/api/assets/logos/ai-major/gemini.svg');
    });

    it('returns null for unknown backends', () => {
      expect(resolveAgentLogo({})).toBeNull();
      expect(resolveAgentLogo({ backend: 'unknown-thing' })).toBeNull();
    });

    it('rewrites the light opencode icon to the dark variant in dark mode', () => {
      document.documentElement.setAttribute('data-theme', 'dark');

      expect(resolveAgentLogo({ icon: '/api/assets/logos/tools/coding/opencode-light.svg' })).toBe(
        '/api/assets/logos/tools/coding/opencode-dark.svg'
      );
    });
  });
});
