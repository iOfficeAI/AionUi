/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fs } from '@/common/adapter/ipcBridge';
import { fromBackendSkillFileNodes, resolveWebSkillFile } from '@/common/adapter/workspaceMapper';

// Keep these spies available when Vitest runs the hoisted module factories before imports.
const mocks = vi.hoisted(() => ({
  nativeListSkillFiles: vi.fn(async () => [{ name: 'native', relativePath: 'native', type: 'file' }]),
  nativeReadSkillFile: vi.fn(async () => 'native content'),
  webListSkillFiles: vi.fn(),
  webReadSkillFile: vi.fn(),
}));

// The adapter creates native providers during module evaluation, so expose
// deterministic implementations for the two skill-file IPC channels.
vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn((channel: string) => {
      const invoke =
        channel === 'skills.files.list'
          ? mocks.nativeListSkillFiles
          : channel === 'skills.files.read'
            ? mocks.nativeReadSkillFile
            : vi.fn();
      return { provider: vi.fn(), invoke };
    }),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

// WebUI falls back to the generic filesystem endpoints; unrelated HTTP
// providers stay inert so importing the shared adapter has no side effects.
vi.mock('@/common/adapter/httpBridge', () => {
  const provider = () => ({ provider: vi.fn(), invoke: vi.fn() });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });
  return {
    httpGet: vi.fn(provider),
    httpPost: vi.fn((path: string) => {
      if (path === '/api/fs/dir') return { provider: vi.fn(), invoke: mocks.webListSkillFiles };
      if (path === '/api/fs/read') return { provider: vi.fn(), invoke: mocks.webReadSkillFile };
      return provider();
    }),
    httpPut: vi.fn(provider),
    httpPatch: vi.fn(provider),
    httpDelete: vi.fn(provider),
    httpRequest: vi.fn(),
    getBaseUrl: vi.fn(() => ''),
    stubProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    withResponseMap: vi.fn((inner: unknown) => inner),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

type WindowWithElectron = { electronAPI?: unknown };

const setElectron = (present: boolean): void => {
  // The production adapter detects Electron through the preload API exposed on window.
  const win = globalThis as unknown as { window?: WindowWithElectron };
  if (!win.window) win.window = {};
  if (present) win.window.electronAPI = { emit: vi.fn(), on: vi.fn() };
  else delete win.window.electronAPI;
};

describe('ipcBridge skill file platform dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setElectron(false);
  });

  afterEach(() => {
    // Do not leak the simulated renderer platform into other Node-environment tests.
    const win = globalThis as unknown as { window?: WindowWithElectron };
    delete win.window;
  });

  it('maps and sorts the recursive WebUI response with normalized paths', async () => {
    mocks.webListSkillFiles.mockResolvedValue([
      { name: 'z.txt', relative_path: 'z.txt', is_dir: false, is_file: true },
      {
        name: 'scripts',
        relative_path: 'scripts',
        is_dir: true,
        is_file: false,
        children: [
          { name: 'Zulu.ts', relative_path: 'scripts\\Zulu.ts', is_dir: false, is_file: true },
          { name: 'alpha.ts', relative_path: 'scripts\\alpha.ts', is_dir: false, is_file: true },
        ],
      },
      { name: 'SKILL.md', relative_path: 'SKILL.md', is_dir: false, is_file: true },
      { name: 'a.txt', relative_path: 'a.txt', is_dir: false, is_file: true },
    ]);
    await expect(fs.listSkillFiles.invoke({ skill_location: 'C:\\skills\\demo' })).resolves.toEqual([
      { name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' },
      {
        name: 'scripts',
        relativePath: 'scripts',
        type: 'directory',
        children: [
          { name: 'alpha.ts', relativePath: 'scripts/alpha.ts', type: 'file' },
          { name: 'Zulu.ts', relativePath: 'scripts/Zulu.ts', type: 'file' },
        ],
      },
      { name: 'a.txt', relativePath: 'a.txt', type: 'file' },
      { name: 'z.txt', relativePath: 'z.txt', type: 'file' },
    ]);
    expect(mocks.webListSkillFiles).toHaveBeenCalledWith({ dir: 'C:/skills/demo', root: 'C:/skills/demo' });
  });

  it('resolves directory and SKILL.md locations to the same WebUI root', async () => {
    mocks.webListSkillFiles.mockResolvedValue([]);
    await fs.listSkillFiles.invoke({ skill_location: '/opt/skills/demo' });
    await fs.listSkillFiles.invoke({ skill_location: '/opt/skills/demo/SKILL.md' });

    expect(mocks.webListSkillFiles.mock.calls).toEqual([
      [{ dir: '/opt/skills/demo', root: '/opt/skills/demo' }],
      [{ dir: '/opt/skills/demo', root: '/opt/skills/demo' }],
    ]);
  });

  it('keeps a root-level skill read inside the filesystem boundary', () => {
    expect(resolveWebSkillFile('/SKILL.md', '/SKILL.md')).toEqual({
      path: '/SKILL.md',
      workspace: '/',
    });
  });

  it('normalizes legacy node fields and infers missing paths and types', () => {
    expect(
      fromBackendSkillFileNodes([
        // Together these fixtures exercise every supported casing and metadata fallback.
        { name: 'legacyDir', relativePath: './legacyDir', isDir: true },
        { name: 'inferredDir', is_file: false },
        { name: 'camel.txt', relativePath: '/camel.txt', isFile: true },
        { name: 'default.txt' },
      ])
    ).toEqual([
      { name: 'inferredDir', relativePath: 'inferredDir', type: 'directory', children: [] },
      { name: 'legacyDir', relativePath: 'legacyDir', type: 'directory', children: [] },
      { name: 'camel.txt', relativePath: 'camel.txt', type: 'file' },
      { name: 'default.txt', relativePath: 'default.txt', type: 'file' },
    ]);
  });

  it('reads an absolute WebUI target within the skill root boundary', async () => {
    mocks.webReadSkillFile.mockResolvedValue('content');
    await expect(
      fs.readSkillFile.invoke({ skill_location: 'C:\\skills\\demo\\SKILL.md', relative_path: 'scripts\\run.ts' })
    ).resolves.toBe('content');
    expect(mocks.webReadSkillFile).toHaveBeenCalledWith({
      path: 'C:/skills/demo/scripts/run.ts',
      workspace: 'C:/skills/demo',
    });
  });

  it('propagates WebUI listing and read failures', async () => {
    const listingError = new Error('listing unavailable');
    const readError = new Error('read unavailable');
    mocks.webListSkillFiles.mockRejectedValue(listingError);
    mocks.webReadSkillFile.mockRejectedValue(readError);
    await expect(fs.listSkillFiles.invoke({ skill_location: '/skills/demo' })).rejects.toBe(listingError);
    await expect(fs.readSkillFile.invoke({ skill_location: '/skills/demo', relative_path: 'SKILL.md' })).rejects.toBe(
      readError
    );
  });

  it('rejects when the WebUI file endpoint returns no content', async () => {
    mocks.webReadSkillFile.mockResolvedValue(null);
    await expect(
      fs.readSkillFile.invoke({ skill_location: '/skills/demo', relative_path: 'SKILL.md' })
    ).rejects.toThrow('Skill file could not be read');
  });

  it('keeps listing and reading on native IPC inside Electron', async () => {
    setElectron(true);
    await expect(fs.listSkillFiles.invoke({ skill_location: '/skills/demo' })).resolves.toEqual([
      { name: 'native', relativePath: 'native', type: 'file' },
    ]);
    await expect(fs.readSkillFile.invoke({ skill_location: '/skills/demo', relative_path: 'SKILL.md' })).resolves.toBe(
      'native content'
    );
    expect(mocks.webListSkillFiles).not.toHaveBeenCalled();
    expect(mocks.webReadSkillFile).not.toHaveBeenCalled();
  });
});
