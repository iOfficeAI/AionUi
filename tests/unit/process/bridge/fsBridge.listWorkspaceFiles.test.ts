import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dirent } from 'fs';
import path from 'path';

const providerCallbacks: Record<string, (...args: unknown[]) => unknown> = {};
const makeProvider = (name: string) => ({
  provider: vi.fn((cb: (...args: unknown[]) => unknown) => {
    providerCallbacks[name] = cb;
  }),
});

const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: () => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    }),
    buildEmitter: () => ({
      emit: vi.fn(),
      on: vi.fn(),
    }),
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: () => '/mock/skills',
  getBuiltinSkillsCopyDir: () => '/mock/skills/_builtin',
  getAutoSkillsDir: () => '/mock/skills/_builtin/_auto',
  getSystemDir: () => ({
    workDir: '/mock/work',
    cacheDir: '/mock/cache',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  getAssistantsDir: () => '/mock/assistants',
}));

vi.mock('@process/utils', () => ({
  readDirectoryRecursive: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: makeProvider('getFilesByDir'),
      listWorkspaceFiles: makeProvider('listWorkspaceFiles'),
      getImageBase64: makeProvider('getImageBase64'),
      fetchRemoteImage: makeProvider('fetchRemoteImage'),
      readFile: makeProvider('readFile'),
      readFileBuffer: makeProvider('readFileBuffer'),
      createTempFile: makeProvider('createTempFile'),
      createUploadFile: makeProvider('createUploadFile'),
      writeFile: makeProvider('writeFile'),
      createZip: makeProvider('createZip'),
      cancelZip: makeProvider('cancelZip'),
      getFileMetadata: makeProvider('getFileMetadata'),
      copyFilesToWorkspace: makeProvider('copyFilesToWorkspace'),
      removeEntry: makeProvider('removeEntry'),
      renameEntry: makeProvider('renameEntry'),
      readBuiltinRule: makeProvider('readBuiltinRule'),
      readBuiltinSkill: makeProvider('readBuiltinSkill'),
      readAssistantRule: makeProvider('readAssistantRule'),
      writeAssistantRule: makeProvider('writeAssistantRule'),
      deleteAssistantRule: makeProvider('deleteAssistantRule'),
      readAssistantSkill: makeProvider('readAssistantSkill'),
      writeAssistantSkill: makeProvider('writeAssistantSkill'),
      deleteAssistantSkill: makeProvider('deleteAssistantSkill'),
      listAvailableSkills: makeProvider('listAvailableSkills'),
      readSkillInfo: makeProvider('readSkillInfo'),
      importSkill: makeProvider('importSkill'),
      scanForSkills: makeProvider('scanForSkills'),
      detectCommonSkillPaths: makeProvider('detectCommonSkillPaths'),
      detectAndCountExternalSkills: makeProvider('detectAndCountExternalSkills'),
      importSkillWithSymlink: makeProvider('importSkillWithSymlink'),
      deleteSkill: makeProvider('deleteSkill'),
      getSkillPaths: makeProvider('getSkillPaths'),
      exportSkillWithSymlink: makeProvider('exportSkillWithSymlink'),
      getCustomExternalPaths: makeProvider('getCustomExternalPaths'),
      addCustomExternalPath: makeProvider('addCustomExternalPath'),
      removeCustomExternalPath: makeProvider('removeCustomExternalPath'),
      enableSkillsMarket: makeProvider('enableSkillsMarket'),
      disableSkillsMarket: makeProvider('disableSkillsMarket'),
      listBuiltinAutoSkills: makeProvider('listBuiltinAutoSkills'),
    },
    fileStream: { contentUpdate: { emit: vi.fn() } },
  },
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      readdir: mockReaddir,
      stat: mockStat,
      readFile: vi.fn(),
      mkdir: vi.fn(),
      writeFile: mockWriteFile,
      rm: vi.fn(),
      rename: vi.fn(),
      realpath: vi.fn(),
      copyFile: vi.fn(),
      symlink: vi.fn(),
      access: vi.fn(),
      unlink: vi.fn(),
      lstat: vi.fn(),
    },
  };
});

function dirent(name: string, kind: 'file' | 'dir'): Dirent {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as Dirent;
}

describe('fsBridge listWorkspaceFiles', () => {
  const workspaceRoot = path.resolve('/workspace');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('@process/bridge/fsBridge');
    mod.initFsBridge();
  });

  it('returns nested files recursively as a flat list', async () => {
    const handler = providerCallbacks.listWorkspaceFiles as (args: {
      root: string;
    }) => Promise<Array<{ name: string; fullPath: string; relativePath: string }>>;

    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockImplementation(async (dirPath: string) => {
      if (dirPath === workspaceRoot) {
        return [dirent('README.md', 'file'), dirent('references', 'dir')];
      }
      if (dirPath === path.join(workspaceRoot, 'references')) {
        return [dirent('prompt-keywords.md', 'file')];
      }
      return [];
    });

    const result = await handler({ root: workspaceRoot });

    expect(result).toEqual([
      {
        name: 'README.md',
        fullPath: path.join(workspaceRoot, 'README.md'),
        relativePath: 'README.md',
      },
      {
        name: 'prompt-keywords.md',
        fullPath: path.join(workspaceRoot, 'references', 'prompt-keywords.md'),
        relativePath: 'references/prompt-keywords.md',
      },
    ]);
  });

  it('reuses the cached file list for repeated requests in the same workspace', async () => {
    const handler = providerCallbacks.listWorkspaceFiles as (args: {
      root: string;
    }) => Promise<Array<{ name: string; fullPath: string; relativePath: string }>>;

    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([dirent('README.md', 'file')]);

    const first = await handler({ root: workspaceRoot });
    const second = await handler({ root: workspaceRoot });

    expect(first).toEqual(second);
    expect(mockReaddir).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached file list after a workspace file write', async () => {
    const listHandler = providerCallbacks.listWorkspaceFiles as (args: {
      root: string;
    }) => Promise<Array<{ name: string; fullPath: string; relativePath: string }>>;
    const writeHandler = providerCallbacks.writeFile as (args: { path: string; data: string }) => Promise<boolean>;

    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockWriteFile.mockResolvedValue(undefined);
    mockReaddir.mockImplementation(async () => [dirent('README.md', 'file')]);

    const first = await listHandler({ root: workspaceRoot });
    expect(first).toEqual([
      {
        name: 'README.md',
        fullPath: path.join(workspaceRoot, 'README.md'),
        relativePath: 'README.md',
      },
    ]);
    expect(mockReaddir).toHaveBeenCalledTimes(1);

    await writeHandler({ path: path.join(workspaceRoot, 'NEW_GUIDE.md'), data: '# guide' });

    mockReaddir.mockImplementation(async () => [dirent('README.md', 'file'), dirent('NEW_GUIDE.md', 'file')]);

    const second = await listHandler({ root: workspaceRoot });
    expect(second).toEqual([
      {
        name: 'NEW_GUIDE.md',
        fullPath: path.join(workspaceRoot, 'NEW_GUIDE.md'),
        relativePath: 'NEW_GUIDE.md',
      },
      {
        name: 'README.md',
        fullPath: path.join(workspaceRoot, 'README.md'),
        relativePath: 'README.md',
      },
    ]);
    expect(mockReaddir).toHaveBeenCalledTimes(2);
  });
});
