import { describe, it, expect, vi, beforeEach } from 'vitest';

// Normalize paths to forward slashes for cross-platform key matching
const norm = (p: string) => p.replace(/\\/g, '/');

// Use vi.hoisted() so tracking variables are initialized before vi.mock factories run
const { mkdirCalls, symlinkCalls, statResults, lstatResults, existsSyncResults, resetAll } = vi.hoisted(() => {
  const mkdirCalls: string[] = [];
  const symlinkCalls: Array<{ source: string; target: string; type: string }> = [];
  const statResults: Record<string, boolean> = {};
  const lstatResults: Record<string, boolean> = {};
  const existsSyncResults: Record<string, boolean> = {};

  const resetAll = () => {
    mkdirCalls.length = 0;
    symlinkCalls.length = 0;
    for (const key of Object.keys(statResults)) delete statResults[key];
    for (const key of Object.keys(lstatResults)) delete lstatResults[key];
    for (const key of Object.keys(existsSyncResults)) delete existsSyncResults[key];
  };

  return { mkdirCalls, symlinkCalls, statResults, lstatResults, existsSyncResults, resetAll };
});

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async (dir: string) => {
      mkdirCalls.push(norm(dir));
    }),
    stat: vi.fn(async (p: string) => {
      if (statResults[norm(p)]) return {};
      throw new Error(`ENOENT: ${p}`);
    }),
    lstat: vi.fn(async (p: string) => {
      if (lstatResults[norm(p)]) return {};
      throw new Error(`ENOENT: ${p}`);
    }),
    symlink: vi.fn(async (source: string, target: string, type: string) => {
      symlinkCalls.push({ source: norm(source), target: norm(target), type });
    }),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => existsSyncResults[norm(p)] ?? false),
}));

vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: vi.fn(() => '/mock/user/skills'),
  getBuiltinSkillsCopyDir: vi.fn(() => '/mock/builtin-skills'),
  getSystemDir: vi.fn(() => '/mock/system'),
}));

vi.mock('@process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(() => 'mock-hash'),
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'mock-uuid'),
}));

describe('initAgent — skill support', () => {
  let hasNativeSkillSupport: (agentTypeOrBackend: string | undefined) => boolean;
  let setupAssistantWorkspace: (
    workspace: string,
    options: { agentType?: string; backend?: string; enabledSkills?: string[] }
  ) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetAll();

    const mod = await import('@process/utils/initAgent');
    hasNativeSkillSupport = mod.hasNativeSkillSupport;
    setupAssistantWorkspace = mod.setupAssistantWorkspace;
  });

  describe('hasNativeSkillSupport', () => {
    it('should return true for all backends with verified native skill dirs', () => {
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
        expect(hasNativeSkillSupport(backend)).toBe(true);
      }
    });

    it('should return false for backends without native skill support', () => {
      const unsupported = ['opencode', 'auggie', 'copilot', 'nanobot', 'qoder'];
      for (const backend of unsupported) {
        expect(hasNativeSkillSupport(backend)).toBe(false);
      }
    });

    it('should return false for undefined or empty string', () => {
      expect(hasNativeSkillSupport(undefined)).toBe(false);
      expect(hasNativeSkillSupport('')).toBe(false);
    });

    it('should return false for unknown backend names', () => {
      expect(hasNativeSkillSupport('unknown-agent')).toBe(false);
      expect(hasNativeSkillSupport('custom')).toBe(false);
    });
  });

  describe('setupAssistantWorkspace', () => {
    it('should skip when enabledSkills is empty', async () => {
      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: [],
      });
      expect(mkdirCalls).toHaveLength(0);
      expect(symlinkCalls).toHaveLength(0);
    });

    it('should skip when enabledSkills is undefined', async () => {
      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
      });
      expect(mkdirCalls).toHaveLength(0);
    });

    it('should skip symlink setup for unsupported backend', async () => {
      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'opencode',
        enabledSkills: ['pptx'],
      });
      expect(mkdirCalls).toHaveLength(0);
      expect(symlinkCalls).toHaveLength(0);
    });

    it('should create symlink in correct dir for claude backend', async () => {
      const skillSource = '/mock/user/skills/pptx';
      statResults[skillSource] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['pptx'],
      });

      expect(mkdirCalls).toContain('/tmp/workspace/.claude/skills');
      expect(symlinkCalls).toHaveLength(1);
      expect(symlinkCalls[0]).toEqual({
        source: skillSource,
        target: '/tmp/workspace/.claude/skills/pptx',
        type: 'junction',
      });
    });

    it('should create symlink in .codex/skills for codex backend', async () => {
      statResults['/mock/user/skills/pdf'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'codex',
        enabledSkills: ['pdf'],
      });

      expect(mkdirCalls).toContain('/tmp/workspace/.codex/skills');
      expect(symlinkCalls[0].target).toBe('/tmp/workspace/.codex/skills/pdf');
    });

    it('should create symlink in .codebuddy/skills for codebuddy', async () => {
      statResults['/mock/user/skills/morph-ppt'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        agentType: 'codebuddy',
        enabledSkills: ['morph-ppt'],
      });

      expect(symlinkCalls[0].target).toBe('/tmp/workspace/.codebuddy/skills/morph-ppt');
    });

    it('should create symlink in .factory/skills for droid backend', async () => {
      statResults['/mock/user/skills/deploy'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'droid',
        enabledSkills: ['deploy'],
      });

      expect(symlinkCalls[0].target).toBe('/tmp/workspace/.factory/skills/deploy');
    });

    it('should use junction type for symlinks (Windows compatibility)', async () => {
      statResults['/mock/user/skills/test-skill'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['test-skill'],
      });

      expect(symlinkCalls[0].type).toBe('junction');
    });

    it('should prefer builtin-skills/ over user skills/', async () => {
      existsSyncResults['/mock/builtin-skills/pptx'] = true;
      statResults['/mock/builtin-skills/pptx'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['pptx'],
      });

      expect(symlinkCalls[0].source).toBe('/mock/builtin-skills/pptx');
    });

    it('should fall back to user skills/ when not in builtin-skills/', async () => {
      existsSyncResults['/mock/builtin-skills/custom-skill'] = false;
      statResults['/mock/user/skills/custom-skill'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['custom-skill'],
      });

      expect(symlinkCalls[0].source).toBe('/mock/user/skills/custom-skill');
    });

    it('should skip cron skill (auto-injected via SkillManager)', async () => {
      statResults['/mock/user/skills/pptx'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['cron', 'pptx'],
      });

      expect(symlinkCalls).toHaveLength(1);
      expect(symlinkCalls[0].target).toContain('pptx');
    });

    it('should skip symlink when target already exists', async () => {
      const skillSource = '/mock/user/skills/pptx';
      const skillTarget = '/tmp/workspace/.claude/skills/pptx';
      statResults[skillSource] = true;
      lstatResults[skillTarget] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['pptx'],
      });

      expect(symlinkCalls).toHaveLength(0);
    });

    it('should warn when source skill directory does not exist', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['nonexistent-skill'],
      });

      expect(symlinkCalls).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-skill'));
      consoleSpy.mockRestore();
    });

    it('should prefer backend over agentType when both provided', async () => {
      statResults['/mock/user/skills/test-skill'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        agentType: 'gemini',
        backend: 'codex',
        enabledSkills: ['test-skill'],
      });

      // backend 'codex' takes priority -> .codex/skills
      expect(mkdirCalls).toContain('/tmp/workspace/.codex/skills');
    });

    it('should handle multiple enabled skills', async () => {
      statResults['/mock/user/skills/pptx'] = true;
      statResults['/mock/user/skills/pdf'] = true;
      statResults['/mock/user/skills/docx'] = true;

      await setupAssistantWorkspace('/tmp/workspace', {
        backend: 'claude',
        enabledSkills: ['pptx', 'pdf', 'docx'],
      });

      expect(symlinkCalls).toHaveLength(3);
    });
  });
});
