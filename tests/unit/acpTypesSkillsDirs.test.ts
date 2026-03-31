import { describe, it, expect } from 'vitest';
import { ACP_BACKENDS_ALL, hasNativeSkillSupport, getSkillsDirsForBackend } from '@/common/types/acpTypes';

describe('acpTypes — skillsDirs integration', () => {
  describe('ACP_BACKENDS_ALL skillsDirs consistency', () => {
    it('should have skillsDirs for all backends that support native skill discovery', () => {
      const expectedSkillsDirs: Record<string, string[]> = {
        claude: ['.claude/skills'],
        gemini: ['.gemini/skills'],
        qwen: ['.qwen/skills'],
        iflow: ['.iflow/skills'],
        codex: ['.codex/skills'],
        codebuddy: ['.codebuddy/skills'],
        goose: ['.goose/skills'],
        kimi: ['.kimi/skills'],
        droid: ['.factory/skills'],
        vibe: ['.vibe/skills'],
        cursor: ['.cursor/skills'],
      };

      for (const [backend, dirs] of Object.entries(expectedSkillsDirs)) {
        const config = ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL];
        expect(config.skillsDirs, `${backend} should have skillsDirs`).toEqual(dirs);
      }
    });

    it('should NOT have skillsDirs for backends that use prompt injection', () => {
      const promptInjectionBackends = ['opencode', 'auggie', 'copilot', 'nanobot', 'qoder', 'kiro'];
      for (const backend of promptInjectionBackends) {
        const config = ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL];
        if (config) {
          expect(config.skillsDirs, `${backend} should not have skillsDirs`).toBeUndefined();
        }
      }
    });

    it('should NOT have skillsDirs for remote and custom backends', () => {
      expect(ACP_BACKENDS_ALL.remote.skillsDirs).toBeUndefined();
      expect(ACP_BACKENDS_ALL.custom.skillsDirs).toBeUndefined();
    });
  });

  describe('hasNativeSkillSupport', () => {
    it('should return true for backends with skillsDirs', () => {
      const supported = [
        'gemini',
        'claude',
        'codebuddy',
        'codex',
        'qwen',
        'iflow',
        'goose',
        'droid',
        'kimi',
        'vibe',
        'cursor',
      ];
      for (const backend of supported) {
        expect(hasNativeSkillSupport(backend), `${backend}`).toBe(true);
      }
    });

    it('should return false for backends without skillsDirs', () => {
      const unsupported = ['opencode', 'auggie', 'copilot', 'nanobot', 'qoder', 'kiro'];
      for (const backend of unsupported) {
        expect(hasNativeSkillSupport(backend), `${backend}`).toBe(false);
      }
    });

    it('should return false for undefined, empty string, or unknown backend', () => {
      expect(hasNativeSkillSupport(undefined)).toBe(false);
      expect(hasNativeSkillSupport('')).toBe(false);
      expect(hasNativeSkillSupport('nonexistent')).toBe(false);
    });

    it('should return false for remote and custom backends', () => {
      expect(hasNativeSkillSupport('remote')).toBe(false);
      expect(hasNativeSkillSupport('custom')).toBe(false);
    });
  });

  describe('getSkillsDirsForBackend', () => {
    it('should return correct skillsDirs for supported backends', () => {
      expect(getSkillsDirsForBackend('claude')).toEqual(['.claude/skills']);
      expect(getSkillsDirsForBackend('droid')).toEqual(['.factory/skills']);
      expect(getSkillsDirsForBackend('gemini')).toEqual(['.gemini/skills']);
    });

    it('should return undefined for unsupported backends', () => {
      expect(getSkillsDirsForBackend('auggie')).toBeUndefined();
      expect(getSkillsDirsForBackend('copilot')).toBeUndefined();
      expect(getSkillsDirsForBackend('nanobot')).toBeUndefined();
      expect(getSkillsDirsForBackend('kiro')).toBeUndefined();
    });

    it('should return undefined for undefined or empty string', () => {
      expect(getSkillsDirsForBackend(undefined)).toBeUndefined();
      expect(getSkillsDirsForBackend('')).toBeUndefined();
    });

    it('should return undefined for unknown backend names', () => {
      expect(getSkillsDirsForBackend('nonexistent')).toBeUndefined();
      expect(getSkillsDirsForBackend('custom')).toBeUndefined();
      expect(getSkillsDirsForBackend('remote')).toBeUndefined();
    });
  });
});
