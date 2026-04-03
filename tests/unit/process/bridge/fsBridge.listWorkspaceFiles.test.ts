import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dirent } from 'fs';

const providerCallbacks: Record<string, (...args: unknown[]) => unknown> = {};
const makeProvider = (name: string) => ({
  provider: vi.fn((cb: (...args: unknown[]) => unknown) => {
    providerCallbacks[name] = cb;
  }),
});

const mockReaddir = vi.fn();
const mockStat = vi.fn();

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
      writeFile: vi.fn(),
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
      if (dirPath === '/workspace') {
        return [dirent('README.md', 'file'), dirent('references', 'dir')];
      }
      if (dirPath === '/workspace/references') {
        return [dirent('prompt-keywords.md', 'file')];
      }
      return [];
    });

    const result = await handler({ root: '/workspace' });

    expect(result).toEqual([
      {
        name: 'README.md',
        fullPath: '/workspace/README.md',
        relativePath: 'README.md',
      },
      {
        name: 'prompt-keywords.md',
        fullPath: '/workspace/references/prompt-keywords.md',
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

    const first = await handler({ root: '/workspace' });
    const second = await handler({ root: '/workspace' });

    expect(first).toEqual(second);
    expect(mockReaddir).toHaveBeenCalledTimes(1);
  });
});
