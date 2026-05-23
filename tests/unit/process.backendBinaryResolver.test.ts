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
    delete process.env.AIONCORE_BIN;
    delete process.env.AIONCORE_BINARY;
  });

  it('prefers explicit env override when present', async () => {
    process.env.AIONCORE_BIN = '/tmp/custom-aioncore';
    existsSyncMock.mockImplementation((candidate) => candidate === '/tmp/custom-aioncore');

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe('/tmp/custom-aioncore');
  });

  it('throws when explicit env override points to a missing file', async () => {
    process.env.AIONCORE_BINARY = '/tmp/missing-aioncore';

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(() => resolveBinaryPath()).toThrow('AIONCORE_BINARY is set but file does not exist');
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

  it('prefers local sibling AionCore debug binary in Electron dev mode', async () => {
    const expected = '/repo/AionCore-main/target/debug/aioncore';
    const originalCwd = process.cwd;
    Object.defineProperty(process, 'cwd', {
      configurable: true,
      value: () => '/repo/AionUi-2.0.2-dev-a3881e2',
    });
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: {
        ...process.versions,
        electron: '37.10.3',
      },
    });
    process.env.NODE_ENV = 'development';
    existsSyncMock.mockImplementation((candidate) => candidate === expected);

    const { resolveBinaryPath } = await import('@process/backend/binaryResolver');

    expect(resolveBinaryPath()).toBe(expected);

    Object.defineProperty(process, 'cwd', {
      configurable: true,
      value: originalCwd,
    });
  });

  it('falls back to system PATH using aioncore', async () => {
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
});
