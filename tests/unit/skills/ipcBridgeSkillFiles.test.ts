/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// These mocks must exist before the adapter's hoisted module mocks select a transport.
const mocks = vi.hoisted(() => ({
  nativeListSkillFiles: vi.fn(async () => [{ name: 'native', relativePath: 'native', type: 'file' }]),
  nativeReadSkillFile: vi.fn(async () => 'native content'),
  webListSkillFiles: vi.fn(),
  webReadSkillFile: vi.fn(),
}));

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
    const { fs } = await import('@/common/adapter/ipcBridge');

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
    const { fs } = await import('@/common/adapter/ipcBridge');

    await fs.listSkillFiles.invoke({ skill_location: '/opt/skills/demo' });
    await fs.listSkillFiles.invoke({ skill_location: '/opt/skills/demo/SKILL.md' });

    expect(mocks.webListSkillFiles.mock.calls).toEqual([
      [{ dir: '/opt/skills/demo', root: '/opt/skills/demo' }],
      [{ dir: '/opt/skills/demo', root: '/opt/skills/demo' }],
    ]);
  });

  it('reads an absolute WebUI target within the skill root boundary', async () => {
    mocks.webReadSkillFile.mockResolvedValue('content');
    const { fs } = await import('@/common/adapter/ipcBridge');

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
    const { fs } = await import('@/common/adapter/ipcBridge');

    await expect(fs.listSkillFiles.invoke({ skill_location: '/skills/demo' })).rejects.toBe(listingError);
    await expect(fs.readSkillFile.invoke({ skill_location: '/skills/demo', relative_path: 'SKILL.md' })).rejects.toBe(
      readError
    );
  });

  it('rejects when the WebUI file endpoint returns no content', async () => {
    mocks.webReadSkillFile.mockResolvedValue(null);
    const { fs } = await import('@/common/adapter/ipcBridge');

    await expect(
      fs.readSkillFile.invoke({ skill_location: '/skills/demo', relative_path: 'SKILL.md' })
    ).rejects.toThrow('Skill file could not be read');
  });

  it('keeps listing and reading on native IPC inside Electron', async () => {
    setElectron(true);
    const { fs } = await import('@/common/adapter/ipcBridge');

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
