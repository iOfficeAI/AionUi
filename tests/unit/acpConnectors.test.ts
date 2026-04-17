/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="node" />

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { fsPromisesMock } = vi.hoisted(() => ({
  fsPromisesMock: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  promises: fsPromisesMock,
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      cb(null, { stdout: '', stderr: '' });
    }
  ),
  execFileSync: vi.fn(() => 'v20.10.0\n'),
}));

vi.mock('@process/utils/shellEnv', () => ({
  findSuitableNodeBin: vi.fn(() => null),
  getEnhancedEnv: vi.fn(() => ({ PATH: '/usr/bin' })),
  getNpxCacheDir: vi.fn(() => '/mock-npm-cache/_npx'),
  getWindowsShellExecutionOptions: vi.fn(() =>
    process.platform === 'win32' ? { shell: true, windowsHide: true } : {}
  ),
  loadFullShellEnvironment: vi.fn(async () => ({ PATH: '/usr/bin' })),
  normalizeNpxArgsForBundledBun: vi.fn((args: string[]) =>
    args.filter((arg) => arg !== '-y' && arg !== '--yes' && arg !== '--prefer-offline')
  ),
  resolveNpxPath: vi.fn(() => '/bundled/bun'),
  resolveNpxDirect: vi.fn(() => null),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

const ccSwitchMock = vi.hoisted(() => ({
  readClaudeProviderEnvFromCcSwitch: vi.fn(() => ({})),
}));

vi.mock('@process/services/ccSwitchModelSource', () => ccSwitchMock);

import { execFile as execFileCb, spawn } from 'child_process';
import { execFileSync } from 'child_process';
import {
  connectClaude,
  connectCodex,
  createGenericSpawnConfig,
  spawnGenericBackend,
  spawnNpxBackend,
} from '../../src/process/agent/acp/acpConnectors';

const mockExecFile = vi.mocked(execFileCb);
const mockExecFileSync = vi.mocked(execFileSync);
const mockFsPromises = vi.mocked(fsPromisesMock);
const mockSpawn = vi.mocked(spawn);

describe('spawnNpxBackend - Windows UTF-8 fix', () => {
  const mockChild = { unref: vi.fn() };

  beforeEach(() => {
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses npxCommand directly on non-Windows (no chcp prefix)', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', '/bundled/bun', {}, '/cwd', false, false);

    expect(mockSpawn).toHaveBeenCalledWith(
      '/bundled/bun',
      expect.any(Array),
      expect.objectContaining({ shell: false })
    );
  });

  it('prefixes command with chcp 65001 on Windows to enable UTF-8', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', '/bundled/bun', {}, '/cwd', true, false);

    const [command, , options] = mockSpawn.mock.calls[0];
    expect(command).toBe('chcp 65001 >nul && "/bundled/bun"');
    expect(options).toMatchObject({ shell: true });
  });

  it('quotes npxCommand on Windows to handle paths with spaces', () => {
    const npxWithSpaces = 'C:\\Program Files\\nodejs\\npx.cmd';
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', npxWithSpaces, {}, '/cwd', true, false);

    const [command] = mockSpawn.mock.calls[0];
    expect(command).toBe(`chcp 65001 >nul && "${npxWithSpaces}"`);
  });

  it('passes bun x --bun and package name as spawn args', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'npx', {}, '/cwd', false, false);

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain('x');
    expect(args).toContain('--bun');
    expect(args).toContain('@pkg/cli@1.0.0');
  });

  it('does not include npx-only flags when preferOffline is true', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'npx', {}, '/cwd', false, true);

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).not.toContain('--prefer-offline');
  });

  it('omits --yes when preferOffline is false', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'npx', {}, '/cwd', false, false);

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).not.toContain('--yes');
  });

  it('calls child.unref() when detached is true', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'npx', {}, '/cwd', false, false, { detached: true });

    expect(mockChild.unref).toHaveBeenCalled();
  });

  it('does not call child.unref() when detached is false', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'npx', {}, '/cwd', false, false, { detached: false });

    expect(mockChild.unref).not.toHaveBeenCalled();
  });

  it('uses bundled bun command with chcp prefix on Windows', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'npx.cmd', {}, 'C:\\cwd', true, false);

    const [command] = mockSpawn.mock.calls[0];
    expect(command).toBe('chcp 65001 >nul && npx.cmd');
  });

  it('falls back to npxCommand when directInvoke is undefined on Windows', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', 'C:\\nodejs\\npx.cmd', {}, 'C:\\cwd', true, false);

    const [command] = mockSpawn.mock.calls[0];
    expect(command).toBe('chcp 65001 >nul && "C:\\nodejs\\npx.cmd"');
  });

  it('uses bundled bun command directly on non-Windows', () => {
    spawnNpxBackend('claude', '@pkg/cli@1.0.0', '/usr/local/bin/npx', {}, '/cwd', false, false);

    const [command] = mockSpawn.mock.calls[0];
    expect(command).toBe('/usr/local/bin/npx');
  });
});

const setWindowsPlatform = () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
};

const setLinuxPlatform = () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
};

describe('createGenericSpawnConfig - Windows path handling', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('returns plain command on non-Windows', () => {
    setLinuxPlatform();
    const config = createGenericSpawnConfig('goose', '/cwd', ['acp'], undefined, { PATH: '/usr/bin' });

    expect(config.command).toBe('goose');
    expect(config.args).toEqual(['acp']);
    expect(config.options).toMatchObject({ shell: false });
  });

  it('wraps cliPath with chcp 65001 and quotes on Windows', () => {
    setWindowsPlatform();
    const config = createGenericSpawnConfig('goose', 'C:\\cwd', ['acp'], undefined, { PATH: 'C:\\Windows' });

    expect(config.command).toBe('chcp 65001 >nul && "goose"');
    expect(config.options).toMatchObject({ shell: true });
  });

  it('handles Windows path with spaces using quotes', () => {
    setWindowsPlatform();
    const config = createGenericSpawnConfig('C:\\Program Files\\agent\\agent.exe', 'C:\\cwd', [], undefined, {
      PATH: 'C:\\Windows',
    });

    expect(config.command).toBe('chcp 65001 >nul && "C:\\Program Files\\agent\\agent.exe"');
  });

  it('splits npx package into command and args (no chcp prefix for npx path)', () => {
    const config = createGenericSpawnConfig('npx @pkg/cli', '/cwd', ['--acp'], undefined, { PATH: '/usr/bin' });

    expect(config.command).toBe('/bundled/bun');
    expect(config.args).toContain('x');
    expect(config.args).toContain('--bun');
    expect(config.args).toContain('@pkg/cli');
    expect(config.args).toContain('--acp');
  });
});

describe('connectCodex - Windows diagnostics', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  const mockChild = { unref: vi.fn() };

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
    mockFsPromises.readdir.mockRejectedValue(new Error('cache not found'));
    mockFsPromises.stat.mockRejectedValue(new Error('not found'));
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        if (args[0] === '--version') {
          cb(null, { stdout: '0.0.1\n', stderr: '' });
          return undefined as never;
        }

        cb(null, { stdout: 'Logged in with ChatGPT\n', stderr: '' });
        return undefined as never;
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('uses shell execution for codex.cmd probes on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const setup = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn().mockResolvedValue(undefined);

    await connectCodex('C:\\cwd', { setup, cleanup });

    expect(mockExecFile).toHaveBeenNthCalledWith(
      1,
      'codex.cmd',
      ['--version'],
      expect.objectContaining({
        env: expect.objectContaining({ PATH: '/usr/bin' }),
        shell: true,
        timeout: 5000,
        windowsHide: true,
      }),
      expect.any(Function)
    );
    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      'codex.cmd',
      ['login', 'status'],
      expect.objectContaining({
        env: expect.objectContaining({ PATH: '/usr/bin' }),
        shell: true,
        timeout: 5000,
        windowsHide: true,
      }),
      expect.any(Function)
    );
    expect(setup).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });
});

describe('connectClaude - detached process group', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  const mockChild = { unref: vi.fn() };

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('spawns detached on POSIX so killChild can terminate the whole Claude ACP process group', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const setup = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn().mockResolvedValue(undefined);

    await connectClaude('/cwd', { setup, cleanup });

    expect(mockSpawn).toHaveBeenCalledWith(
      '/bundled/bun',
      expect.arrayContaining(['x', '--bun', '@zed-industries/claude-agent-acp@0.21.0']),
      expect.objectContaining({
        cwd: '/cwd',
        detached: true,
        shell: false,
      })
    );
    expect(mockChild.unref).toHaveBeenCalledTimes(1);
  });

  it('injects Claude env from cc-switch into the spawned process env', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    ccSwitchMock.readClaudeProviderEnvFromCcSwitch.mockReturnValue({
      ANTHROPIC_BASE_URL: 'http://localhost:4000',
      ANTHROPIC_AUTH_TOKEN: 'sk-test-token',
    });

    const setup = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn().mockResolvedValue(undefined);

    await connectClaude('/cwd', { setup, cleanup });

    expect(mockSpawn).toHaveBeenCalledWith(
      '/bundled/bun',
      expect.arrayContaining(['x', '--bun', '@zed-industries/claude-agent-acp@0.21.0']),
      expect.objectContaining({
        env: expect.objectContaining({
          PATH: '/usr/bin',
          ANTHROPIC_BASE_URL: 'http://localhost:4000',
          ANTHROPIC_AUTH_TOKEN: 'sk-test-token',
        }),
      })
    );
  });

  it('does not detach on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const setup = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn().mockResolvedValue(undefined);

    await connectClaude('C:\\cwd', { setup, cleanup });

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('chcp 65001 >nul &&'),
      expect.arrayContaining(['x', '--bun', '@zed-industries/claude-agent-acp@0.21.0']),
      expect.objectContaining({
        cwd: 'C:\\cwd',
        detached: false,
        shell: true,
      })
    );
    expect(mockChild.unref).not.toHaveBeenCalled();
  });
});

describe('spawnGenericBackend - detached process group', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  const mockChild = { unref: vi.fn() };

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('spawns detached on POSIX so generic ACP backends can be killed as a process group', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const result = await spawnGenericBackend('qwen', 'qwen', '/cwd', ['--acp']);

    expect(mockSpawn).toHaveBeenCalledWith(
      'qwen',
      ['--acp'],
      expect.objectContaining({
        cwd: '/cwd',
        detached: true,
        shell: false,
      })
    );
    expect(result.isDetached).toBe(true);
    expect(mockChild.unref).toHaveBeenCalledTimes(1);
  });

  it('does not detach generic ACP backends on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = await spawnGenericBackend('qwen', 'qwen', 'C:\\cwd', ['--acp']);

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('chcp 65001 >nul &&'),
      ['--acp'],
      expect.objectContaining({
        cwd: 'C:\\cwd',
        detached: false,
        shell: true,
      })
    );
    expect(result.isDetached).toBe(false);
    expect(mockChild.unref).not.toHaveBeenCalled();
  });
});

describe('connectCodex - Windows package selection', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  let originalArch: PropertyDescriptor | undefined;
  const mockChild = { unref: vi.fn() };

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
    mockExecFileSync.mockImplementation(() => 'v20.10.0\n' as never);
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
    mockFsPromises.readdir.mockRejectedValue(new Error('cache not found'));
    mockFsPromises.stat.mockRejectedValue(new Error('not found'));
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    if (originalArch) {
      Object.defineProperty(process, 'arch', originalArch);
    }
    vi.clearAllMocks();
  });

  it('uses the direct Windows platform package first with bundled bun', async () => {
    const hooks = {
      setup: vi.fn(async () => {}),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('C:\\cwd', hooks);

    const [command, args] = mockSpawn.mock.calls[0];
    expect(command).toContain('chcp 65001 >nul &&');
    expect(args).toContain('x');
    expect(args).toContain('--bun');
    expect(args).toContain('@zed-industries/codex-acp-win32-x64@0.9.5');
  });

  it('uses the direct Windows platform package first when startup succeeds', async () => {
    const hooks = {
      setup: vi.fn(async () => {}),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('C:\\cwd', hooks);

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain('@zed-industries/codex-acp-win32-x64@0.9.5');
    expect(args).not.toContain('@zed-industries/codex-acp@0.9.5');
    expect(mockChild.unref).not.toHaveBeenCalled();
  });

  it('falls back to the meta package when the direct Windows platform package times out', async () => {
    const hooks = {
      setup: vi.fn(async () => {
        const [, args] = mockSpawn.mock.calls.at(-1) ?? [];
        if (Array.isArray(args) && args.includes('@zed-industries/codex-acp-win32-x64@0.9.5')) {
          throw new Error('Request initialize timed out after 60 seconds');
        }
      }),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('C:\\cwd', hooks);

    const firstCallArgs = mockSpawn.mock.calls[0]?.[1];
    const secondCallArgs = mockSpawn.mock.calls[1]?.[1];

    expect(firstCallArgs).toContain('@zed-industries/codex-acp-win32-x64@0.9.5');
    expect(secondCallArgs).toContain('@zed-industries/codex-acp@0.9.5');
  });
});

describe('connectCodex - Linux package selection', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  let originalArch: PropertyDescriptor | undefined;
  const mockChild = { unref: vi.fn() };

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
    mockExecFileSync.mockImplementation(() => 'v20.10.0\n' as never);
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
    mockFsPromises.readdir.mockRejectedValue(new Error('cache not found'));
    mockFsPromises.stat.mockRejectedValue(new Error('not found'));
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    if (originalArch) {
      Object.defineProperty(process, 'arch', originalArch);
    }
    vi.clearAllMocks();
  });

  it('uses the direct Linux platform package first with bundled bun', async () => {
    const hooks = {
      setup: vi.fn(async () => {}),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('/cwd', hooks);

    const [command, args] = mockSpawn.mock.calls[0];
    expect(command).toBe('/bundled/bun');
    expect(args).toContain('x');
    expect(args).toContain('--bun');
    expect(args).toContain('@zed-industries/codex-acp-linux-x64');
  });

  it('uses the direct Linux platform package first when startup succeeds', async () => {
    const hooks = {
      setup: vi.fn(async () => {}),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('/cwd', hooks);

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain('@zed-industries/codex-acp-linux-x64');
    expect(args).not.toContain('@zed-industries/codex-acp@0.9.5');
    expect(mockChild.unref).not.toHaveBeenCalled();
  });

  it('falls back to the meta package when the direct Linux platform package times out', async () => {
    const hooks = {
      setup: vi.fn(async () => {
        const [, args] = mockSpawn.mock.calls.at(-1) ?? [];
        if (Array.isArray(args) && args.includes('@zed-industries/codex-acp-linux-x64')) {
          throw new Error('Request initialize timed out after 60 seconds');
        }
      }),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('/cwd', hooks);

    const firstCallArgs = mockSpawn.mock.calls[0]?.[1];
    const secondCallArgs = mockSpawn.mock.calls[1]?.[1];

    expect(firstCallArgs).toContain('@zed-industries/codex-acp-linux-x64');
    expect(secondCallArgs).toContain('@zed-industries/codex-acp@0.9.5');
  });
});

describe('connectCodex - Darwin optional dependency fallback', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  let originalArch: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalArch = Object.getOwnPropertyDescriptor(process, 'arch');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
    mockExecFileSync.mockImplementation(() => 'v20.10.0\n' as never);
    mockSpawn.mockReturnValue({ unref: vi.fn() } as unknown as ReturnType<typeof spawn>);
    mockFsPromises.readdir.mockRejectedValue(new Error('cache not found'));
    mockFsPromises.stat.mockRejectedValue(new Error('not found'));
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    if (originalArch) {
      Object.defineProperty(process, 'arch', originalArch);
    }
    vi.clearAllMocks();
  });

  it('retries with the direct Darwin platform package when the meta package misses its optional binary', async () => {
    const hooks = {
      setup: vi.fn(async () => {
        const [, args] = mockSpawn.mock.calls.at(-1) ?? [];
        if (Array.isArray(args) && args.includes('@zed-industries/codex-acp@0.9.5')) {
          throw new Error(
            "Error resolving package: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@zed-industries/codex-acp-darwin-x64' imported from /tmp/codex-acp.js\n" +
              'Failed to locate @zed-industries/codex-acp-darwin-x64 binary. This usually means the optional dependency was not installed.'
          );
        }
      }),
      cleanup: vi.fn(async () => {}),
    };

    await connectCodex('/cwd', hooks);

    const firstCallArgs = mockSpawn.mock.calls[0]?.[1];
    const secondCallArgs = mockSpawn.mock.calls[1]?.[1];

    expect(firstCallArgs).toContain('@zed-industries/codex-acp@0.9.5');
    expect(secondCallArgs).toContain('@zed-industries/codex-acp-darwin-x64');
  });
});
