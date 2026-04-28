import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers the backend-driven skill materialization path in initAgent:
 * `setupAssistantWorkspace` now calls `materializeSkillsForAgent` with the
 * resolved skill list and symlinks each returned `source_path` directly into
 * the CLI-native skills folder (no per-conversation copy).
 */

const norm = (p: string) => p.replace(/\\/g, '/');

type MaterializeResponse = { skills: Array<{ name: string; source_path: string }> };

const { materializeInvoke, mkdirCalls, symlinkCalls, lstatResults, statResults, reset } = vi.hoisted(() => {
  const materializeMock =
    vi.fn<(args: { conversation_id: string; skills: string[] }) => Promise<MaterializeResponse>>();
  const mk: string[] = [];
  const links: Array<{ source: string; target: string; type: string }> = [];
  const ls: Record<string, boolean> = {};
  const st: Record<string, boolean> = {};
  return {
    materializeInvoke: materializeMock,
    mkdirCalls: mk,
    symlinkCalls: links,
    lstatResults: ls,
    statResults: st,
    reset: () => {
      materializeMock.mockReset();
      mk.length = 0;
      links.length = 0;
      for (const k of Object.keys(ls)) delete ls[k];
      for (const k of Object.keys(st)) delete st[k];
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      materializeSkillsForAgent: { invoke: materializeInvoke },
    },
  },
}));

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

  it('resolves sources via backend and symlinks each source_path into the native skills dir', async () => {
    materializeInvoke.mockResolvedValueOnce({
      skills: [
        { name: 'cron', source_path: '/mock/data/builtin-skills/auto-inject/cron' },
        { name: 'office-cli', source_path: '/mock/data/builtin-skills/office-cli' },
        { name: 'pptx', source_path: '/mock/data/skills/pptx' },
      ],
    });

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-1',
      backend: 'claude',
      skills: ['cron', 'office-cli', 'pptx'],
    });

    expect(materializeInvoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      skills: ['cron', 'office-cli', 'pptx'],
    });
    expect(mkdirCalls).toContain('/tmp/ws/.claude/skills');
    expect(symlinkCalls).toHaveLength(3);
    // Source paths are forwarded verbatim — no per-conv copy step.
    expect(
      symlinkCalls
        .map((c) => ({ source: c.source, target: c.target }))
        .toSorted((a, b) => a.target.localeCompare(b.target))
    ).toEqual([
      { source: '/mock/data/builtin-skills/auto-inject/cron', target: '/tmp/ws/.claude/skills/cron' },
      { source: '/mock/data/builtin-skills/office-cli', target: '/tmp/ws/.claude/skills/office-cli' },
      { source: '/mock/data/skills/pptx', target: '/tmp/ws/.claude/skills/pptx' },
    ]);
    expect(symlinkCalls.every((c) => c.type === 'junction')).toBe(true);
  });

  it('only symlinks skills returned in the backend response', async () => {
    materializeInvoke.mockResolvedValueOnce({
      skills: [{ name: 'office-cli', source_path: '/mock/data/builtin-skills/office-cli' }],
    });

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-2',
      backend: 'claude',
      skills: ['office-cli'],
    });

    expect(symlinkCalls.map((c) => c.target)).toEqual(['/tmp/ws/.claude/skills/office-cli']);
  });

  it('degrades to an empty symlink set when the backend call fails', async () => {
    materializeInvoke.mockRejectedValueOnce(new Error('backend offline'));

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-3',
      backend: 'claude',
      skills: ['pptx'],
    });

    expect(mkdirCalls).toContain('/tmp/ws/.claude/skills');
    expect(symlinkCalls).toHaveLength(0);
  });

  it('is a no-op for backends without native skill support', async () => {
    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-4',
      agent_type: 'nanobot',
      skills: [],
    });

    expect(materializeInvoke).not.toHaveBeenCalled();
    expect(mkdirCalls).toHaveLength(0);
    expect(symlinkCalls).toHaveLength(0);
  });

  it('still wires extra skill paths that live outside the backend corpus', async () => {
    materializeInvoke.mockResolvedValueOnce({ skills: [] });
    statResults['/cron-jobs/job-1'] = true;

    await setupAssistantWorkspace('/tmp/ws', {
      conversationId: 'conv-5',
      backend: 'claude',
      skills: [],
      extraSkillPaths: ['/cron-jobs/job-1'],
    });

    expect(symlinkCalls).toEqual([
      { source: '/cron-jobs/job-1', target: '/tmp/ws/.claude/skills/job-1', type: 'junction' },
    ]);
  });
});
