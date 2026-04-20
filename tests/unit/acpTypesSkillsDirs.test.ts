import { describe, it, expect } from 'vitest';
import { ACP_BACKENDS_ALL, hasNativeSkillSupport, getSkillsDirsForBackend } from '@/common/types/acpTypes';

describe('acpTypes — skillsDirs integration', () => {
  describe('ACP_BACKENDS_ALL skillsDirs consistency', () => {
    it('should have skillsDirs for all backends that support native skill discovery', () => {
      // Note: aionrs was removed from ACP_BACKENDS_ALL (non-ACP protocol)
      const expectedSkillsDirs: Record<string, string[]> = {
        claude: ['.claude/skills'],
        qwen: ['.qwen/skills'],
        codex: ['.codex/skills'],
        codebuddy: ['.codebuddy/skills'],
        goose: ['.goose/skills'],
        kimi: ['.kimi/skills'],
        droid: ['.factory/skills'],
        vibe: ['.vibe/skills'],
        cursor: ['.cursor/skills'],
        opencode: ['.opencode/skills'],
      };

      for (const [backend, dirs] of Object.entries(expectedSkillsDirs)) {
        const config = ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL];
        expect(config.skillsDirs, `${backend} should have skillsDirs`).toEqual(dirs);
      }
    });

    it('should NOT have skillsDirs for backends that use prompt injection', () => {
      // nanobot removed from ACP_BACKENDS_ALL (non-ACP protocol)
      const promptInjectionBackends = ['auggie', 'copilot', 'qoder', 'kiro'];
      for (const backend of promptInjectionBackends) {
        const config = ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL];
        if (config) {
          expect(config.skillsDirs, `${backend} should not have skillsDirs`).toBeUndefined();
        }
      }
    });

    it('should NOT have skillsDirs for custom backend', () => {
      expect(ACP_BACKENDS_ALL.custom.skillsDirs).toBeUndefined();
    });
  });

  describe('hasNativeSkillSupport', () => {
    it('should return true for backends with skillsDirs', () => {
      // Includes both ACP backends and non-ACP agents with native skill support
      const supported = [
        'claude',
        'codebuddy',
        'codex',
        'qwen',
        'goose',
        'droid',
        'kimi',
        'vibe',
        'cursor',
        'opencode',
        'gemini',
        'aionrs',
      ];
      for (const backend of supported) {
        expect(hasNativeSkillSupport(backend), `${backend}`).toBe(true);
      }
    });

    it('should return false for backends without skillsDirs', () => {
      const unsupported = ['auggie', 'copilot', 'qoder', 'kiro'];
      for (const backend of unsupported) {
        expect(hasNativeSkillSupport(backend), `${backend}`).toBe(false);
      }
    });

    it('should return false for undefined, empty string, or unknown backend', () => {
      expect(hasNativeSkillSupport(undefined)).toBe(false);
      expect(hasNativeSkillSupport('')).toBe(false);
      expect(hasNativeSkillSupport('nonexistent')).toBe(false);
    });

    it('should return false for custom backend', () => {
      expect(hasNativeSkillSupport('custom')).toBe(false);
    });

    it('should return false for removed non-ACP backends without skill support', () => {
      // These were removed from ACP_BACKENDS_ALL and have no skill directories
      expect(hasNativeSkillSupport('remote')).toBe(false);
      expect(hasNativeSkillSupport('nanobot')).toBe(false);
    });

    it('should return true for non-ACP agents with native skill dirs', () => {
      // gemini and aionrs are not ACP backends but support native skill discovery
      expect(hasNativeSkillSupport('gemini')).toBe(true);
      expect(hasNativeSkillSupport('aionrs')).toBe(true);
    });
  });

  describe('getSkillsDirsForBackend', () => {
    it('should return correct skillsDirs for supported backends', () => {
      expect(getSkillsDirsForBackend('claude')).toEqual(['.claude/skills']);
      expect(getSkillsDirsForBackend('droid')).toEqual(['.factory/skills']);
      expect(getSkillsDirsForBackend('gemini')).toEqual(['.gemini/skills']); // non-ACP but has skill dirs
      expect(getSkillsDirsForBackend('aionrs')).toEqual(['.aionrs/skills']); // non-ACP but has skill dirs
    });

    it('should return undefined for unsupported backends', () => {
      expect(getSkillsDirsForBackend('auggie')).toBeUndefined();
      expect(getSkillsDirsForBackend('copilot')).toBeUndefined();
      expect(getSkillsDirsForBackend('kiro')).toBeUndefined();
    });

    it('should return undefined for undefined or empty string', () => {
      expect(getSkillsDirsForBackend(undefined)).toBeUndefined();
      expect(getSkillsDirsForBackend('')).toBeUndefined();
    });

    it('should return undefined for unknown backend names', () => {
      expect(getSkillsDirsForBackend('nonexistent')).toBeUndefined();
      expect(getSkillsDirsForBackend('custom')).toBeUndefined();
    });
  });
});
