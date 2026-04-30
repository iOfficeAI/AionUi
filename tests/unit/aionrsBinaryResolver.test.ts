import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn<(path: string) => boolean>();
const mockExecSync = vi.fn<(command: string) => string>();

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

describe('aionrs binary resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  });

  it('prefers bundled-aionrs from project resources in development', async () => {
    const devBundledPath = `${process.cwd()}/resources/bundled-aionrs/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'aionrs.exe' : 'aionrs'}`;
    mockExistsSync.mockImplementation((path) => path === devBundledPath);

    const { resolveAionrsBinary } = await import('../../src/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe(devBundledPath);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('falls back to PATH lookup when no bundled binary exists', async () => {
    mockExistsSync.mockImplementation((path) => path === '/usr/local/bin/aionrs');
    mockExecSync.mockImplementation((command) => {
      if (command === 'which aionrs') return '/usr/local/bin/aionrs\n';
      throw new Error(`unexpected command: ${command}`);
    });

    const { resolveAionrsBinary } = await import('../../src/process/agent/aionrs/binaryResolver');

    expect(resolveAionrsBinary()).toBe('/usr/local/bin/aionrs');
  });
});
