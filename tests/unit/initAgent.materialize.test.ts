import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers the backend-driven skill materialization path in initAgent:
 * `setupAssistantWorkspace` now calls `materializeSkillsForAgent` and
 * symlinks each returned skill dir into the CLI-native skills folder.
 */

const norm = (p: string) => p.replace(/\\/g, '/');

const {
  materializeInvoke,
  cleanupInvoke,
  mkdirCalls,
  symlinkCalls,
  lstatResults,
  statResults,
  readdirResults,
  reset,
} = vi.hoisted(() => {
  const materializeMock = vi.fn<(args: { conversationId: string; enabledSkills: string[] }) => Promise<{ dirPath: string }>>();
  const cleanupMock = vi.fn<(args: { conversationId: string }) => Promise<void>>();
  const mk: string[] = [];
  const links: Array<{ source: string; target: string; type: string }> = [];
  const ls: Record<string, boolean> = {};
  const st: Record<string, boolean> = {};
  const rd: Record<string, string[]> = {};
  return {
    materializeInvoke: materializeMock,
    cleanupInvoke: cleanupMock,
    mkdirCalls: mk,
    symlinkCalls: links,
    lstatResults: ls,
    statResults: st,
    readdirResults: rd,
    reset: () => {
      materializeMock.mockReset();
      cleanupMock.mockReset();
      mk.length = 0;
      links.length = 0;
      for (const k of Object.keys(ls)) delete ls[k];
      for (const k of Object.keys(st)) delete st[k];
      for (const k of Object.keys(rd)) delete rd[k];
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      materializeSkillsForAgent: { invoke: materializeInvoke },
      cleanupSkillsForAgent: { invoke: cleanupInvoke },
    },
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async (dir: string) => {
      mkdirCalls.push(norm(dir));
    }),
    readdir: vi.fn(async (dir: string, _opts?: unknown) => {
      const entries = readdirResults[norm(dir)] ?? [];
      return entries.map((name) => ({
        name,
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
      }));
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

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: vi.fn(() => ({ workDir: '/mock/workdir' })),
}));

vi.mock('@process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(() => 'mock-hash'),
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'mock-conversation-id'),
}));

describe('initAgent — setupAssistantWorkspace materialization', () => {
  let setupAssistantWorkspace: typeof import('@process/utils/initAgent').setupAssistantWorkspace;

  beforeEach(async () => {
    reset();
    const mod = await import('@process/utils/initAgent');
    setupAssistantWorkspace = mod.setupAssistantWorkspace;
  });

  it('materializes via backend and symlinks each skill subdir into the native skills dir', async () => {
    const dirPath = '/mock/data/agent-skills/conv-1';
    materializeInvoke.mockResolvedValueOnce({ dirPath });
    readdirResults[dirPath] = ['cron', 'office-cli', 'pptx'];

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-1',
      backend: 'claude',
      enabled_skills: ['pptx'],
    });

    expect(materializeInvoke).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      enabledSkills: ['pptx'],
    });
    expect(mkdirCalls).toContain('/tmp/ws/.claude/skills');
    expect(symlinkCalls).toHaveLength(3);
    expect(symlinkCalls.map((c) => c.target).toSorted()).toEqual([
      '/tmp/ws/.claude/skills/cron',
      '/tmp/ws/.claude/skills/office-cli',
      '/tmp/ws/.claude/skills/pptx',
    ]);
    expect(symlinkCalls.every((c) => c.type === 'junction')).toBe(true);
  });

  it('skips skills listed in excludeBuiltinSkills', async () => {
    const dirPath = '/mock/data/agent-skills/conv-2';
    materializeInvoke.mockResolvedValueOnce({ dirPath });
    readdirResults[dirPath] = ['cron', 'office-cli'];

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-2',
      backend: 'claude',
      excludeBuiltinSkills: ['cron'],
    });

    expect(symlinkCalls.map((c) => c.target)).toEqual(['/tmp/ws/.claude/skills/office-cli']);
  });

  it('degrades to an empty symlink set when the backend call fails', async () => {
    materializeInvoke.mockRejectedValueOnce(new Error('backend offline'));

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-3',
      backend: 'claude',
      enabledSkills: ['pptx'],
    });

    expect(mkdirCalls).toContain('/tmp/ws/.claude/skills');
    expect(symlinkCalls).toHaveLength(0);
  });

  it('is a no-op for backends without native skill support', async () => {
    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-4',
      agentType: 'nanobot',
    });

    expect(materializeInvoke).not.toHaveBeenCalled();
    expect(mkdirCalls).toHaveLength(0);
    expect(symlinkCalls).toHaveLength(0);
  });

  it('still wires extra skill paths that live outside the backend corpus', async () => {
    const dirPath = '/mock/data/agent-skills/conv-5';
    materializeInvoke.mockResolvedValueOnce({ dirPath });
    readdirResults[dirPath] = [];
    statResults['/cron-jobs/job-1'] = true;

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-5',
      backend: 'claude',
      extraSkillPaths: ['/cron-jobs/job-1'],
    });

    expect(symlinkCalls).toEqual([
      { source: '/cron-jobs/job-1', target: '/tmp/ws/.claude/skills/job-1', type: 'junction' },
    ]);
  });
});
