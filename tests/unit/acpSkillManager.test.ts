import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers the post-migration `AcpSkillManager` which pulls skill metadata and
 * bodies from the backend via `ipcBridge.fs.*` HTTP calls. The singleton /
 * cache-key / frontmatter-parsing behaviour is preserved from the pre-
 * migration implementation.
 */

type AutoSkillEntry = { name: string; description: string; location: string };
type AvailableSkill = {
  name: string;
  description: string;
  location: string;
  relativeLocation?: string;
  isCustom: boolean;
  source: 'builtin' | 'custom' | 'extension';
};

const { listBuiltinAutoSkills, readBuiltinSkill, listAvailableSkills, fsReadFile, registryGetSkills, resetMocks } =
  vi.hoisted(() => {
    const autoMock = vi.fn<() => Promise<AutoSkillEntry[]>>();
    const readMock = vi.fn<(args: { fileName: string }) => Promise<string>>();
    const listMock = vi.fn<() => Promise<AvailableSkill[]>>();
    const readFileMock = vi.fn<(path: string, encoding: string) => Promise<string>>();
    const registryMock = vi.fn<() => Array<{ name: string; description: string; location: string }>>();
    return {
      listBuiltinAutoSkills: autoMock,
      readBuiltinSkill: readMock,
      listAvailableSkills: listMock,
      fsReadFile: readFileMock,
      registryGetSkills: registryMock,
      resetMocks: () => {
        autoMock.mockReset();
        readMock.mockReset();
        listMock.mockReset();
        readFileMock.mockReset();
        registryMock.mockReset();
      },
    };
  });

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listBuiltinAutoSkills: { invoke: listBuiltinAutoSkills },
      readBuiltinSkill: { invoke: readBuiltinSkill },
      listAvailableSkills: { invoke: listAvailableSkills },
    },
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: (path: string, encoding: string) => fsReadFile(path, encoding),
  },
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({ getSkills: () => registryGetSkills() }),
  },
}));

describe('AcpSkillManager', () => {
  beforeEach(async () => {
    resetMocks();
    registryGetSkills.mockReturnValue([]);
    const mod = await import('@process/task/AcpSkillManager');
    mod.AcpSkillManager.resetInstance();
  });

  it('populates the auto-inject map via listBuiltinAutoSkills HTTP', async () => {
    listBuiltinAutoSkills.mockResolvedValueOnce([
      { name: 'cron', description: 'schedule tasks', location: 'auto-inject/cron/SKILL.md' },
      { name: 'office-cli', description: 'office helper', location: 'auto-inject/office-cli/SKILL.md' },
    ]);

    const { AcpSkillManager } = await import('@process/task/AcpSkillManager');
    const mgr = AcpSkillManager.getInstance();
    await mgr.discoverAutoSkills();

    const index = mgr.getBuiltinSkillsIndex();
    expect(index).toHaveLength(2);
    expect(index.map((s) => s.name).toSorted()).toEqual(['cron', 'office-cli']);
    expect(listBuiltinAutoSkills).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list and does not throw when the HTTP call fails', async () => {
    listBuiltinAutoSkills.mockRejectedValueOnce(new Error('backend offline'));

    const { AcpSkillManager } = await import('@process/task/AcpSkillManager');
    const mgr = AcpSkillManager.getInstance();
    await mgr.discoverAutoSkills();

    expect(mgr.hasAnySkills()).toBe(false);
    expect(mgr.getBuiltinSkillsIndex()).toEqual([]);
  });

  it('reuses the singleton when the cache key matches', async () => {
    listBuiltinAutoSkills.mockResolvedValue([]);
    listAvailableSkills.mockResolvedValue([]);

    const { AcpSkillManager } = await import('@process/task/AcpSkillManager');
    const a = AcpSkillManager.getInstance(['pptx'], ['cron']);
    const b = AcpSkillManager.getInstance(['pptx'], ['cron']);
    const c = AcpSkillManager.getInstance(['pptx']);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('loads a builtin body via readBuiltinSkill using relative location', async () => {
    listBuiltinAutoSkills.mockResolvedValueOnce([
      { name: 'cron', description: 'schedule', location: 'auto-inject/cron/SKILL.md' },
    ]);
    readBuiltinSkill.mockResolvedValueOnce(
      '---\nname: cron\ndescription: schedule\n---\n\nDetailed cron instructions.'
    );

    const { AcpSkillManager } = await import('@process/task/AcpSkillManager');
    const mgr = AcpSkillManager.getInstance();
    await mgr.discoverAutoSkills();
    const skill = await mgr.getSkill('cron');

    expect(readBuiltinSkill).toHaveBeenCalledWith({ fileName: 'auto-inject/cron/SKILL.md' });
    expect(skill?.body).toBe('Detailed cron instructions.');
    expect(fsReadFile).not.toHaveBeenCalled();
  });

  it('reads custom skill bodies from the local filesystem using the absolute location', async () => {
    listBuiltinAutoSkills.mockResolvedValueOnce([]);
    listAvailableSkills.mockResolvedValueOnce([
      {
        name: 'my-skill',
        description: 'user skill',
        location: '/home/user/skills/my-skill/SKILL.md',
        isCustom: true,
        source: 'custom',
      },
    ]);
    fsReadFile.mockResolvedValueOnce('---\nname: my-skill\n---\n\nCustom body.');

    const { AcpSkillManager } = await import('@process/task/AcpSkillManager');
    const mgr = AcpSkillManager.getInstance(['my-skill']);
    await mgr.discoverSkills(['my-skill']);

    const skill = await mgr.getSkill('my-skill');
    expect(skill?.body).toBe('Custom body.');
    expect(fsReadFile).toHaveBeenCalledWith('/home/user/skills/my-skill/SKILL.md', 'utf-8');
    expect(readBuiltinSkill).not.toHaveBeenCalled();
  });

  it('excludes auto-inject skills listed in excludeBuiltinSkills', async () => {
    listBuiltinAutoSkills.mockResolvedValueOnce([
      { name: 'cron', description: '', location: 'auto-inject/cron/SKILL.md' },
      { name: 'office-cli', description: '', location: 'auto-inject/office-cli/SKILL.md' },
    ]);

    const { AcpSkillManager } = await import('@process/task/AcpSkillManager');
    const mgr = AcpSkillManager.getInstance(undefined, ['cron']);
    await mgr.discoverAutoSkills(['cron']);

    expect(mgr.getBuiltinSkillsIndex().map((s) => s.name)).toEqual(['office-cli']);
  });
});
