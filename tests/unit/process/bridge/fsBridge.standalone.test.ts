import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the bridge so provider() calls are no-ops
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

// Mock initStorage path helpers
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

// Mock common ipcBridge
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: { provider: vi.fn() },
      listWorkspaceFiles: { provider: vi.fn() },
      getImageBase64: { provider: vi.fn() },
      fetchRemoteImage: { provider: vi.fn() },
      readFile: { provider: vi.fn() },
      readFileBuffer: { provider: vi.fn() },
      createTempFile: { provider: vi.fn() },
      createUploadFile: { provider: vi.fn() },
      writeFile: { provider: vi.fn() },
      createZip: { provider: vi.fn() },
      cancelZip: { provider: vi.fn() },
      getFileMetadata: { provider: vi.fn() },
      copyFilesToWorkspace: { provider: vi.fn() },
      removeEntry: { provider: vi.fn() },
      renameEntry: { provider: vi.fn() },
      readBuiltinRule: { provider: vi.fn() },
      readBuiltinSkill: { provider: vi.fn() },
      readAssistantRule: { provider: vi.fn() },
      writeAssistantRule: { provider: vi.fn() },
      deleteAssistantRule: { provider: vi.fn() },
      readAssistantSkill: { provider: vi.fn() },
      writeAssistantSkill: { provider: vi.fn() },
      deleteAssistantSkill: { provider: vi.fn() },
      listAvailableSkills: { provider: vi.fn() },
      listBuiltinAutoSkills: { provider: vi.fn() },
      readSkillInfo: { provider: vi.fn() },
      importSkill: { provider: vi.fn() },
      scanForSkills: { provider: vi.fn() },
      detectCommonSkillPaths: { provider: vi.fn() },
      detectAndCountExternalSkills: { provider: vi.fn() },
      importSkillWithSymlink: { provider: vi.fn() },
      deleteSkill: { provider: vi.fn() },
      getSkillPaths: { provider: vi.fn() },
      exportSkillWithSymlink: { provider: vi.fn() },
      getCustomExternalPaths: { provider: vi.fn() },
      addCustomExternalPath: { provider: vi.fn() },
      removeCustomExternalPath: { provider: vi.fn() },
      enableSkillsMarket: { provider: vi.fn() },
      disableSkillsMarket: { provider: vi.fn() },
    },
    fileStream: { contentUpdate: { emit: vi.fn() } },
  },
}));

describe('fsBridge standalone compatibility', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('imports without requiring electron', async () => {
    // If this import succeeds, the module has no top-level Electron dependency
    const mod = await import('@process/bridge/fsBridge');
    expect(mod.initFsBridge).toBeTypeOf('function');
  });

  it('initFsBridge() registers all providers without throwing', async () => {
    const { initFsBridge } = await import('@process/bridge/fsBridge');
    expect(() => initFsBridge()).not.toThrow();
  });
});
