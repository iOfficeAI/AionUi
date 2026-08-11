import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function buildAionCliCoreMock(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    ApprovalMode: { DEFAULT: 'default', YOLO: 'yolo' },
    Config: class ConfigMock {
      constructor(readonly options: unknown) {}

      setFallbackModelHandler = vi.fn();
    },
    DEFAULT_GEMINI_EMBEDDING_MODEL: 'text-embedding-004',
    DEFAULT_GEMINI_MODEL: 'gemini-2.5-pro',
    DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: {},
    FileDiscoveryService: class FileDiscoveryServiceMock {},
    getCurrentGeminiMdFilename: () => 'GEMINI.md',
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    isNodeError: (error: unknown): error is NodeJS.ErrnoException =>
      typeof error === 'object' && error !== null && 'code' in error,
    loadServerHierarchicalMemory: vi.fn(async () => ({
      memoryContent: { global: '', extension: '', project: '' },
      fileCount: 0,
    })),
    loadSkillsFromDir: vi.fn(async () => []),
    PREVIEW_GEMINI_MODEL_AUTO: 'auto-gemini-3',
    setGeminiMdFilename: vi.fn(),
    SimpleExtensionLoader: class SimpleExtensionLoaderMock {
      getExtensions() {
        return [];
      }
    },
    unescapePath: (value: string) => value.replace(/\\ /g, ' '),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('@office-ai/aioncli-core');
  vi.doUnmock('../../src/process/agent/gemini/index');
});

/**
 * Verifies that an inaccessible workspace directory causes fs.realpath to
 * throw EACCES, which is now caught early in GeminiAgent.initialize() before
 * aioncli-core can trigger an unhandled rejection.
 *
 * Fixes: ELECTRON-BM — "EACCES: permission denied, realpath gemini-temp-*"
 * Root cause: aioncli-core calls fs.realpath(workspace) without try-catch.
 * The existing mkdir guard (ELECTRON-6W fix) handles ENOENT but not EACCES.
 * Fix: GeminiAgent.initialize() now calls fs.promises.realpath(path) after
 * mkdir, turning the unhandled rejection into a catchable bootstrap error.
 */
describe('gemini workspace EACCES guard (ELECTRON-BM)', () => {
  // Skip on Windows — chmod has no effect on NTFS
  const isWindows = process.platform === 'win32';
  // Skip when running as root — root bypasses file permissions
  const isRoot = process.getuid?.() === 0;
  const describeUnix = isWindows || isRoot ? describe.skip : describe;

  describeUnix('on Unix with non-root user', () => {
    it('fs.realpath fails with EACCES when parent directory lacks execute permission', async () => {
      // Create parent/child structure to simulate EACCES on realpath
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-eacces-'));
      const child = path.join(parent, 'workspace');
      await fs.mkdir(child);

      // Remove execute permission on parent — child path becomes unresolvable
      await fs.chmod(parent, 0o600);

      try {
        await expect(fs.realpath(child)).rejects.toThrow(/EACCES/);
      } finally {
        await fs.chmod(parent, 0o755);
        await fs.rm(parent, { recursive: true });
      }
    });

    it('mkdir recursive does NOT detect EACCES on existing directory', async () => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-eacces-'));
      const child = path.join(parent, 'workspace');
      await fs.mkdir(child);

      await fs.chmod(parent, 0o600);

      try {
        // mkdir recursive on an existing path may succeed even when the path
        // is not traversable — this is why the ENOENT guard (mkdir) alone
        // is insufficient for EACCES scenarios.
        const mkdirResult = fs.mkdir(child, { recursive: true });
        // On some platforms mkdir may succeed, on others it may fail.
        // The point is: we cannot rely on mkdir alone to detect EACCES.
        await mkdirResult.catch(() => {});

        // But realpath consistently fails — this is the new guard
        await expect(fs.realpath(child)).rejects.toThrow(/EACCES/);
      } finally {
        await fs.chmod(parent, 0o755);
        await fs.rm(parent, { recursive: true });
      }
    });

    it('realpath succeeds on accessible directory (no false positive)', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-ok-'));

      const realPath = await fs.realpath(tmpDir);
      expect(realPath).toBeTruthy();

      await fs.rm(tmpDir, { recursive: true });
    });
  });
});

describe('gemini cli config memory discovery fallback', () => {
  it('continues with empty memory when hierarchical discovery hits EACCES', async () => {
    vi.resetModules();
    vi.doUnmock('@office-ai/aioncli-core');
    vi.doUnmock('../../src/process/agent/gemini/index');

    const loadServerHierarchicalMemoryMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied, open /tmp/postgres'), {
        code: 'EACCES',
      })
    );
    const setFallbackModelHandler = vi.fn();
    const configInstances: Array<{
      options: unknown;
      setFallbackModelHandler: typeof setFallbackModelHandler;
    }> = [];

    class ConfigMock {
      options: unknown;
      setFallbackModelHandler = setFallbackModelHandler;

      constructor(options: unknown) {
        this.options = options;
        configInstances.push(this);
      }
    }

    class FileDiscoveryServiceMock {}

    class SimpleExtensionLoaderMock {
      getExtensions() {
        return [];
      }
    }

    vi.doMock('@office-ai/aioncli-core', async () => {
      return buildAionCliCoreMock({
        Config: ConfigMock,
        FileDiscoveryService: FileDiscoveryServiceMock,
        SimpleExtensionLoader: SimpleExtensionLoaderMock,
        loadServerHierarchicalMemory: loadServerHierarchicalMemoryMock,
      });
    });
    vi.doMock('../../src/process/agent/gemini/index', () => ({
      getCurrentGeminiAgent: () => null,
    }));

    const { loadCliConfig } = await import('../../src/process/agent/gemini/cli/config');

    await loadCliConfig({
      workspace: '/tmp/aionui-workspace',
      settings: {},
      extensions: [],
      sessionId: 'session-1',
      conversationToolConfig: {
        getConfig: () => ({ excludeTools: [] }),
      } as never,
    });

    expect(loadServerHierarchicalMemoryMock).toHaveBeenCalledOnce();
    expect(configInstances).toHaveLength(1);

    const configOptions = configInstances[0]?.options as {
      userMemory: { global: string; extension: string; project: string };
      geminiMdFileCount: number;
    };

    expect(configOptions.userMemory).toEqual({
      global: '',
      extension: '',
      project: '',
    });
    expect(configOptions.geminiMdFileCount).toBe(0);
    expect(setFallbackModelHandler).toHaveBeenCalledOnce();
  });

  it('rethrows non-permission memory discovery errors', async () => {
    vi.resetModules();
    vi.doUnmock('@office-ai/aioncli-core');
    vi.doUnmock('../../src/process/agent/gemini/index');

    const loadServerHierarchicalMemoryMock = vi.fn().mockRejectedValue(new Error('memory discovery exploded'));

    class ConfigMock {
      constructor(readonly options: unknown) {}

      setFallbackModelHandler = vi.fn();
    }

    class FileDiscoveryServiceMock {}

    class SimpleExtensionLoaderMock {
      getExtensions() {
        return [];
      }
    }

    vi.doMock('@office-ai/aioncli-core', async () => {
      return buildAionCliCoreMock({
        Config: ConfigMock,
        FileDiscoveryService: FileDiscoveryServiceMock,
        SimpleExtensionLoader: SimpleExtensionLoaderMock,
        loadServerHierarchicalMemory: loadServerHierarchicalMemoryMock,
      });
    });
    vi.doMock('../../src/process/agent/gemini/index', () => ({
      getCurrentGeminiAgent: () => null,
    }));

    const { loadCliConfig } = await import('../../src/process/agent/gemini/cli/config');

    await expect(
      loadCliConfig({
        workspace: '/tmp/aionui-workspace',
        settings: {},
        extensions: [],
        sessionId: 'session-2',
        conversationToolConfig: {
          getConfig: () => ({ excludeTools: [] }),
        } as never,
      })
    ).rejects.toThrow('memory discovery exploded');
  });
});

describe('gemini @directory handling', () => {
  it('does not expand directory references into recursive globs before read_many_files', async () => {
    vi.resetModules();
    vi.doMock('@office-ai/aioncli-core', () => buildAionCliCoreMock({}));

    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-dir-ref-'));
    try {
      const repoDir = path.join(workspaceRoot, 'repo');
      await fs.mkdir(path.join(repoDir, 'docker', 'volumes', 'postgres'), { recursive: true });

      const buildMock = vi.fn(() => ({
        getDescription: () => 'mock read_many_files',
        execute: vi.fn().mockResolvedValue({
          llmContent: ['No files matching the criteria were found or all were skipped.'],
          returnDisplay: 'No files were read.',
        }),
      }));

      const { handleAtCommand } = await import('../../src/process/agent/gemini/cli/atCommandProcessor');

      const result = await handleAtCommand({
        query: 'inspect @repo',
        config: {
          getFileService: () => ({
            shouldIgnoreFile: () => false,
          }),
          getFileFilteringOptions: () => ({
            respectGitIgnore: true,
            respectGeminiIgnore: true,
          }),
          getToolRegistry: async () => ({
            getTool: (name: string) => {
              if (name === 'read_many_files') {
                return {
                  build: buildMock,
                  displayName: 'ReadManyFiles',
                };
              }
              return undefined;
            },
          }),
          getWorkspaceContext: () => ({
            isPathWithinWorkspace: () => true,
            getDirectories: () => [workspaceRoot],
          }),
          getEnableRecursiveFileSearch: () => true,
        } as never,
        addItem: () => {},
        onDebugMessage: () => {},
        messageId: Date.now(),
        signal: new AbortController().signal,
      });

      expect(result.shouldProceed).toBe(true);
      expect(buildMock).toHaveBeenCalledOnce();
      expect(buildMock).toHaveBeenCalledWith({
        paths: ['repo'],
        file_filtering_options: {
          respect_git_ignore: true,
          respect_gemini_ignore: true,
        },
      });
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
