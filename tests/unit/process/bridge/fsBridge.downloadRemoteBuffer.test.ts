import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ClientRequest } from 'node:http';

// Capture provider callbacks so we can invoke them directly
const providerCallbacks: Record<string, (...args: unknown[]) => unknown> = {};
const mockProvider = (name: string) =>
  vi.fn((cb: (...args: unknown[]) => unknown) => {
    providerCallbacks[name] = cb;
  });

// Controllable mock for https.get — tests can override via mockHttpsGet
let mockHttpsGet: ((...args: unknown[]) => unknown) | undefined;

vi.mock('node:https', () => ({
  default: {
    get: (...args: unknown[]) => {
      if (mockHttpsGet) return mockHttpsGet(...args);
      // Default: return a request that does nothing (for tests that don't need network)
      const req = new EventEmitter() as EventEmitter & Partial<ClientRequest>;
      req.setTimeout = vi.fn().mockReturnThis();
      return req as ClientRequest;
    },
  },
}));

vi.mock('node:http', () => ({
  default: {
    get: vi.fn(),
  },
}));

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
  getBuiltinSkillsCopyDir: () => '/mock/builtin-skills-copy',
  getSystemDir: () => ({
    workDir: '/mock/work',
    cacheDir: '/mock/cache',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  getAssistantsDir: () => '/mock/assistants',
  getAutoSkillsDir: () => '/mock/auto-skills',
}));

vi.mock('@process/utils', () => ({
  readDirectoryRecursive: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFilesByDir: { provider: vi.fn() },
      listWorkspaceFiles: { provider: vi.fn() },
      getImageBase64: { provider: vi.fn() },
      fetchRemoteImage: { provider: mockProvider('fetchRemoteImage') },
      readFile: { provider: vi.fn() },
      readFileBuffer: { provider: vi.fn() },
      createTempFile: { provider: vi.fn() },
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

describe('downloadRemoteBuffer URL validation (ELECTRON-77)', () => {
  beforeEach(async () => {
    mockHttpsGet = undefined;
    vi.resetModules();
    // Re-import to register providers fresh
    const mod = await import('@process/bridge/fsBridge');
    mod.initFsBridge();
  });

  it('returns empty string for disallowed host instead of unhandled rejection', async () => {
    const handler = providerCallbacks.fetchRemoteImage;
    expect(handler).toBeDefined();

    // Call with a URL whose host is not in the allowlist
    const result = await handler({ url: 'https://evil.example.com/image.png' });
    expect(result).toBe('');
  });

  it('returns empty string for unsupported protocol', async () => {
    const handler = providerCallbacks.fetchRemoteImage;
    expect(handler).toBeDefined();

    const result = await handler({ url: 'ftp://github.com/file.txt' });
    expect(result).toBe('');
  });

  it('returns empty string for invalid URL', async () => {
    const handler = providerCallbacks.fetchRemoteImage;
    expect(handler).toBeDefined();

    const result = await handler({ url: 'not-a-valid-url' });
    expect(result).toBe('');
  });
});

describe('downloadRemoteBuffer redirect to non-whitelisted host (ELECTRON-9N)', () => {
  beforeEach(async () => {
    mockHttpsGet = undefined;
    vi.resetModules();
    const mod = await import('@process/bridge/fsBridge');
    mod.initFsBridge();
  });

  it('handles redirect to non-whitelisted host without uncaught exception', async () => {
    // Simulate a 302 redirect from github.com to a non-whitelisted CDN host
    mockHttpsGet = (_url: unknown, _opts: unknown, cb: unknown) => {
      const response = new EventEmitter() as EventEmitter & Partial<IncomingMessage>;
      response.statusCode = 302;
      response.headers = { location: 'https://cdn.evil.com/image.png' };
      (response as IncomingMessage & { resume: () => void }).resume = vi.fn();

      // Call the response callback asynchronously to simulate real behavior
      queueMicrotask(() => (cb as (res: unknown) => void)(response));

      const request = new EventEmitter() as EventEmitter & Partial<ClientRequest>;
      request.setTimeout = vi.fn().mockReturnThis();
      return request as ClientRequest;
    };

    const handler = providerCallbacks.fetchRemoteImage;
    expect(handler).toBeDefined();

    // Before the fix, this would throw synchronously inside the response callback,
    // causing an uncaught exception. After the fix, it returns a rejected promise
    // that is caught by fetchRemoteImage's try/catch, returning empty string.
    const result = await handler({ url: 'https://github.com/some/image.png' });
    expect(result).toBe('');
  });

  it('handles redirect to invalid URL without uncaught exception', async () => {
    mockHttpsGet = (_url: unknown, _opts: unknown, cb: unknown) => {
      const response = new EventEmitter() as EventEmitter & Partial<IncomingMessage>;
      response.statusCode = 302;
      response.headers = { location: 'http://%' };
      (response as IncomingMessage & { resume: () => void }).resume = vi.fn();

      queueMicrotask(() => (cb as (res: unknown) => void)(response));

      const request = new EventEmitter() as EventEmitter & Partial<ClientRequest>;
      request.setTimeout = vi.fn().mockReturnThis();
      return request as ClientRequest;
    };

    const handler = providerCallbacks.fetchRemoteImage;
    expect(handler).toBeDefined();

    const result = await handler({ url: 'https://github.com/some/image.png' });
    expect(result).toBe('');
  });
});
