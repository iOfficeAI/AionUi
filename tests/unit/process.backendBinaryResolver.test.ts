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

  it('resolves aioncore from PATH', async () => {
    execSyncMock.mockImplementation((command) => {
      if (command === 'which aioncore') {
        return '/usr/local/bin/aioncore';
      }
      throw new Error(`unexpected command: ${command}`);
    });
    existsSyncMock.mockImplementation((candidate) => candidate === '/usr/local/bin/aioncore');

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe('/usr/local/bin/aioncore');
  });

  it('prefers upstream bundled aioncore when present', async () => {
    const expected = '/mock/resources/bundled-aioncore/darwin-arm64/aioncore';
    existsSyncMock.mockImplementation((candidate) => candidate === expected);

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe(expected);
  });

  it('uses bundled aioncore layout', async () => {
    const expected = '/mock/resources/bundled-aioncore/darwin-arm64/aioncore';
    existsSyncMock.mockImplementation((candidate) => candidate === expected);

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe(expected);
  });
});
