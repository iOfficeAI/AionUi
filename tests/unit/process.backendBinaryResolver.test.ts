import { beforeEach, describe, expect, it, vi } from 'vitest';

const existsSyncMock = vi.fn<(path: string) => boolean>();
const execSyncMock = vi.fn<(command: string) => string>();
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('node:child_process', () => ({
  execSync: execSyncMock,
}));

describe('process/backend/binaryResolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    execSyncMock.mockImplementation(() => {
      throw new Error('not found');
    });
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = '/mock/resources';
  });

  it('warns when both legacy and upstream PATH backends are installed', async () => {
    execSyncMock.mockImplementation((command) => {
      if (command === 'which aionui-backend') {
        return '/usr/local/bin/aionui-backend';
      }
      if (command === 'which aioncore') {
        return '/usr/local/bin/aioncore';
      }
      throw new Error(`unexpected command: ${command}`);
    });
    existsSyncMock.mockImplementation(
      (candidate) => candidate === '/usr/local/bin/aionui-backend' || candidate === '/usr/local/bin/aioncore'
    );

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe('/usr/local/bin/aionui-backend');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Multiple backend binaries detected in PATH')
    );
  });

  it('prefers legacy bundled aionui-backend when present', async () => {
    const expected = '/mock/resources/bundled-aionui-backend/darwin-arm64/aionui-backend';
    existsSyncMock.mockImplementation((candidate) => candidate === expected);

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe(expected);
  });

  it('accepts upstream bundled aioncore layout when legacy bundle is absent', async () => {
    const expected = '/mock/resources/bundled-aioncore/darwin-arm64/aioncore';
    existsSyncMock.mockImplementation((candidate) => candidate === expected);

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe(expected);
  });

  it('falls back to system PATH using aioncore when legacy command is absent', async () => {
    execSyncMock.mockImplementation((command) => {
      if (command === 'which aionui-backend') {
        throw new Error('not found');
      }
      if (command === 'which aioncore') {
        return '/usr/local/bin/aioncore';
      }
      throw new Error(`unexpected command: ${command}`);
    });
    existsSyncMock.mockImplementation((candidate) => candidate === '/usr/local/bin/aioncore');

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe('/usr/local/bin/aioncore');
  });
});
