import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture provider callbacks registered during initFsBridge()
const providerCallbacks: Record<string, (...args: unknown[]) => unknown> = {};

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
  getBuiltinSkillsDir: () => '/mock/skills/_builtin',
  getBuiltinSkillsCopyDir: () => '/mock/builtin-skills',
  getAutoSkillsDir: () => '/mock/builtin-skills/_builtin',
  getSystemDir: () => ({
    workDir: '/mock/work',
    cacheDir: '/mock/cache',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  getAssistantsDir: () => '/mock/assistants',
}));

vi.mock('@/common', () => {
  const makeProvider = (name: string) => ({
    provider: vi.fn((cb: (...args: unknown[]) => unknown) => {
      providerCallbacks[name] = cb;
    }),
  });

  return {
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
  };
});

// Mock fs/promises to control readFile behavior
const mockReadFile = vi.fn();
const mockStat = vi.fn();
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFile: mockReadFile,
      stat: mockStat,
      readdir: vi.fn(),
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

async function setupProviders() {
  const { initFsBridge } = await import('@process/bridge/fsBridge');
  initFsBridge();
}

function makeErrnoError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('fsBridge readFile/readFileBuffer EBUSY handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import and initialize to capture provider callbacks
    vi.resetModules();
  });

  it('readFile returns null for EBUSY (file locked by another process)', async () => {
    await setupProviders();
    const readFileCb = providerCallbacks['readFile'] as (args: { path: string }) => Promise<string | null>;
    expect(readFileCb).toBeDefined();

    mockStat.mockResolvedValueOnce({ size: 100 });
    mockReadFile.mockRejectedValueOnce(makeErrnoError('EBUSY', 'EBUSY: resource busy or locked'));

    const result = await readFileCb({ path: '/some/locked/file.pptx' });
    expect(result).toBeNull();
  });

  it('readFile returns null for ENOENT (missing file)', async () => {
    await setupProviders();
    const readFileCb = providerCallbacks['readFile'] as (args: { path: string }) => Promise<string | null>;

    mockStat.mockRejectedValueOnce(makeErrnoError('ENOENT', 'ENOENT: no such file or directory'));

    const result = await readFileCb({ path: '/missing/file.txt' });
    expect(result).toBeNull();
  });

  it('readFile throws for other errors (e.g., EPERM)', async () => {
    await setupProviders();
    const readFileCb = providerCallbacks['readFile'] as (args: { path: string }) => Promise<string | null>;

    mockStat.mockResolvedValueOnce({ size: 100 });
    mockReadFile.mockRejectedValueOnce(makeErrnoError('EPERM', 'EPERM: operation not permitted'));

    await expect(readFileCb({ path: '/forbidden/file.txt' })).rejects.toThrow('EPERM');
  });

  it('readFile returns null for files exceeding 256MB size limit (ELECTRON-D3)', async () => {
    await setupProviders();
    const readFileCb = providerCallbacks['readFile'] as (args: { path: string }) => Promise<string | null>;

    const oversizedBytes = 256 * 1024 * 1024 + 1; // 256 MB + 1 byte
    mockStat.mockResolvedValueOnce({ size: oversizedBytes });

    const result = await readFileCb({ path: '/huge/database.bin' });
    expect(result).toBeNull();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('readFileBuffer returns null for EBUSY', async () => {
    await setupProviders();
    const readFileBufferCb = providerCallbacks['readFileBuffer'] as (args: {
      path: string;
    }) => Promise<ArrayBuffer | null>;
    expect(readFileBufferCb).toBeDefined();

    mockReadFile.mockRejectedValueOnce(makeErrnoError('EBUSY', 'EBUSY: resource busy or locked'));

    const result = await readFileBufferCb({ path: '/some/locked/file.pptx' });
    expect(result).toBeNull();
  });

  it('readFile returns content when file is accessible', async () => {
    await setupProviders();
    const readFileCb = providerCallbacks['readFile'] as (args: { path: string }) => Promise<string | null>;

    mockStat.mockResolvedValueOnce({ size: 1024 });
    mockReadFile.mockResolvedValueOnce('file content');

    const result = await readFileCb({ path: '/valid/file.txt' });
    expect(result).toBe('file content');
  });
});
