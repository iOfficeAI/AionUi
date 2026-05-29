import { beforeEach, describe, expect, it, vi } from 'vitest';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

type ExecState = {
  bunInPath: boolean;
  npmInPath: boolean;
  curlInPath: boolean;
  wgetInPath: boolean;
  uvInPath: boolean;
  python3InPath: boolean;
  pythonInPath: boolean;
  claudeInstalled: boolean;
  openclawInstalled: boolean;
  hermesInstalled: boolean;
};

const installProvider = vi.fn();
const uninstallProvider = vi.fn();
const httpRequestMock = vi.fn();
const reconcileManagedRuntimeStateMock = vi.fn();
const clearManagedRuntimeForCliTargetMock = vi.fn();
const execFileMock = vi.fn();

const existingPaths = new Set<string>();
const execState: ExecState = {
  bunInPath: true,
  npmInPath: true,
  curlInPath: true,
  wgetInPath: false,
  uvInPath: true,
  python3InPath: true,
  pythonInPath: false,
  claudeInstalled: false,
  openclawInstalled: false,
  hermesInstalled: false,
};

const mockHome = '/mock-home';
const bunBinPath = `${mockHome}/.bun/bin/bun`;
const bunShimPath = `${mockHome}/.bun/bin/bun`;
const bunClaudePath = `${mockHome}/.bun/bin/claude`;
const bunOpenclawPath = `${mockHome}/.bun/bin/openclaw`;
const uvBinPath = `${mockHome}/.local/bin/uv`;
const hermesShimPath = `${mockHome}/.local/bin/hermes`;
const hermesVenvDir = `${mockHome}/.hermes/hermes-agent/venv`;

vi.mock('@/common', () => ({
  ipcBridge: {
    managedCliInstaller: {
      install: { provider: installProvider },
      uninstall: { provider: uninstallProvider },
    },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

vi.mock('@process/bridge/services/NewApiDesktopAccountService', () => ({
  newApiDesktopAccountService: {
    reconcileManagedRuntimeState: reconcileManagedRuntimeStateMock,
    clearManagedRuntimeForCliTarget: clearManagedRuntimeForCliTargetMock,
  },
}));

vi.mock('@/common/config/appEnv', () => ({
  getEnvAwareName: vi.fn((baseName: string) => `${baseName}-dev`),
}));

vi.mock('node:os', () => ({
  default: {
    homedir: () => mockHome,
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn((candidate: string) => existingPaths.has(candidate)),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((target: string) => {
      existingPaths.add(target);
      if (target === hermesShimPath) {
        execState.hermesInstalled = true;
      }
    }),
    rmSync: vi.fn((target: string) => {
      for (const candidate of Array.from(existingPaths)) {
        if (candidate === target || candidate.startsWith(`${target}/`)) {
          existingPaths.delete(candidate);
        }
      }
      if (target === bunOpenclawPath) execState.openclawInstalled = false;
      if (target === bunClaudePath) execState.claudeInstalled = false;
      if (target === hermesShimPath || target.includes('/.hermes/hermes-agent')) execState.hermesInstalled = false;
    }),
  },
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

function execSuccess(callback: ExecCallback, stdout = ''): void {
  callback(null, stdout, '');
}

function execFailure(callback: ExecCallback, message: string): void {
  callback(new Error(message), '', message);
}

function resetExecState(): void {
  execState.bunInPath = true;
  execState.npmInPath = true;
  execState.curlInPath = true;
  execState.wgetInPath = false;
  execState.uvInPath = true;
  execState.python3InPath = true;
  execState.pythonInPath = false;
  execState.claudeInstalled = false;
  execState.openclawInstalled = false;
  execState.hermesInstalled = false;
}

function resetFsState(): void {
  existingPaths.clear();
}

function installExecFileBehavior(): void {
  execFileMock.mockImplementation(
    (command: string, args: string[], _options: Record<string, unknown>, callback: ExecCallback) => {
      if (command === 'which') {
        const target = args[0];
        if (
          (target === 'bun' && execState.bunInPath) ||
          (target === 'npm' && execState.npmInPath) ||
          (target === 'curl' && execState.curlInPath) ||
          (target === 'wget' && execState.wgetInPath) ||
          (target === 'uv' && execState.uvInPath) ||
          (target === 'python3' && execState.python3InPath) ||
          (target === 'python' && execState.pythonInPath) ||
          (target === 'claude' && execState.claudeInstalled) ||
          (target === 'openclaw' && execState.openclawInstalled) ||
          (target === 'hermes' && execState.hermesInstalled)
        ) {
          execSuccess(callback, `/usr/bin/${target}`);
        } else {
          execFailure(callback, `${target} not found`);
        }
        return { unref: vi.fn() };
      }

      if (command === 'sh' && args[1]?.includes('bun.com/install')) {
        existingPaths.add(bunBinPath);
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if (command === 'sh' && args[1]?.includes('astral.sh/uv/install.sh')) {
        existingPaths.add(uvBinPath);
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if ((command === 'bun' || command === bunBinPath || command === bunShimPath) && args[0] === 'add') {
        const packageName = args.at(-1);
        if (packageName === '@anthropic-ai/claude-code') {
          execState.claudeInstalled = true;
          existingPaths.add(bunClaudePath);
        }
        if (packageName === 'openclaw') {
          execState.openclawInstalled = true;
          existingPaths.add(bunOpenclawPath);
        }
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if ((command === 'bun' || command === bunBinPath || command === bunShimPath) && args[0] === 'remove') {
        const packageName = args.at(-1);
        if (packageName === '@anthropic-ai/claude-code') {
          execState.claudeInstalled = false;
          existingPaths.delete(bunClaudePath);
        }
        if (packageName === 'openclaw') {
          execState.openclawInstalled = false;
          existingPaths.delete(bunOpenclawPath);
        }
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if (command === 'npm' && args[0] === 'install') {
        const packageName = args.at(-1);
        if (packageName === 'bun') {
          execState.bunInPath = true;
          existingPaths.add(bunBinPath);
        }
        if (packageName === '@anthropic-ai/claude-code') {
          execState.claudeInstalled = true;
        }
        if (packageName === 'openclaw') {
          execState.openclawInstalled = true;
        }
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if (command === 'npm' && args[0] === 'uninstall') {
        const packageName = args.at(-1);
        if (packageName === '@anthropic-ai/claude-code') {
          execState.claudeInstalled = false;
        }
        if (packageName === 'openclaw') {
          execState.openclawInstalled = false;
        }
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if (
        (command === 'python3' || command === 'python' || command === 'py') &&
        args[0] === '-m' &&
        args[1] === 'pip'
      ) {
        existingPaths.add(uvBinPath);
        execState.uvInPath = true;
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if ((command === 'python3' || command === 'python' || command === 'py') && args[0] === '-c') {
        execSuccess(callback, `${mockHome}/.local`);
        return { unref: vi.fn() };
      }

      if ((command === 'uv' || command === uvBinPath) && args[0] === 'venv') {
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      if ((command === 'uv' || command === uvBinPath) && args[0] === 'pip') {
        execState.hermesInstalled = true;
        execSuccess(callback);
        return { unref: vi.fn() };
      }

      execSuccess(callback);
      return { unref: vi.fn() };
    }
  );
}

async function loadHandlers() {
  vi.resetModules();
  const mod = await import('@process/bridge/managedCliInstallerBridge');
  mod.initManagedCliInstallerBridge();
  const installHandler = installProvider.mock.calls.at(-1)?.[0];
  const uninstallHandler = uninstallProvider.mock.calls.at(-1)?.[0];
  if (!installHandler || !uninstallHandler) {
    throw new Error('Managed CLI installer handlers were not registered');
  }
  return { installHandler, uninstallHandler };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetExecState();
  resetFsState();
  installExecFileBehavior();
  httpRequestMock.mockResolvedValue(undefined);
  reconcileManagedRuntimeStateMock.mockResolvedValue(undefined);
  clearManagedRuntimeForCliTargetMock.mockResolvedValue(undefined);
  delete process.env.BUN_BINARY;
  delete process.env.UV_BINARY;
  delete process.env.BUN_INSTALL;
});

describe('managedCliInstallerBridge', () => {
  it('installs claude successfully and syncs managed runtime state', async () => {
    const { installHandler } = await loadHandlers();

    const result = await installHandler({ target: 'claude' });

    expect(result).toEqual({ success: true, status: 'installed', message: undefined });
    expect(reconcileManagedRuntimeStateMock).toHaveBeenCalledWith({ cliTarget: 'claude' });
    expect(httpRequestMock).toHaveBeenCalledWith('POST', '/api/agents/refresh');
    expect(execFileMock).toHaveBeenCalledWith(
      'bun',
      ['add', '-g', '@anthropic-ai/claude-code'],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('does not treat uv alone as hermes still installed after uninstall', async () => {
    existingPaths.add(uvBinPath);
    execState.uvInPath = true;

    const { uninstallHandler } = await loadHandlers();

    const result = await uninstallHandler('hermes');

    expect(result).toEqual({ success: true, status: 'not_installed', message: undefined });
  });

  it('uninstalls openclaw cleanly and clears managed runtime state', async () => {
    execState.openclawInstalled = true;
    existingPaths.add(bunOpenclawPath);

    const { uninstallHandler } = await loadHandlers();

    const result = await uninstallHandler('openclaw');

    expect(result).toEqual({ success: true, status: 'not_installed', message: undefined });
    expect(clearManagedRuntimeForCliTargetMock).toHaveBeenCalledWith('openclaw');
    expect(httpRequestMock).toHaveBeenCalledWith('POST', '/api/agents/refresh');
    expect(existingPaths.has(bunOpenclawPath)).toBe(false);
  });

  it('installs bun first when bun is missing, then uses bun for openclaw', async () => {
    execState.bunInPath = false;
    execState.openclawInstalled = false;
    const { installHandler } = await loadHandlers();

    const result = await installHandler({ target: 'openclaw' });

    expect(result).toEqual({ success: true, status: 'installed', message: undefined });
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'bun'],
      expect.any(Object),
      expect.any(Function)
    );
    expect(execFileMock).toHaveBeenCalledWith(
      'bun',
      ['add', '-g', 'openclaw'],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('auto-installs bun via npm when bun is missing, then installs openclaw', async () => {
    execState.bunInPath = false;
    execState.openclawInstalled = false;
    const { installHandler } = await loadHandlers();

    const result = await installHandler({ target: 'openclaw' });

    expect(result).toEqual({ success: true, status: 'installed', message: undefined });
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'bun'],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('fails hermes install with actionable message when uv is missing', async () => {
    execState.uvInPath = false;
    execState.python3InPath = false;
    execState.pythonInPath = false;
    const { installHandler } = await loadHandlers();

    const result = await installHandler({ target: 'hermes' });

    expect(result).toEqual({
      success: false,
      status: 'failed',
      message: 'uv is required for Hermes installation. No suitable Python runtime was found to auto-install it.',
    });
  });

  it('auto-installs uv via python user-site mirror when uv is missing', async () => {
    execState.uvInPath = false;
    execState.python3InPath = true;
    const { installHandler } = await loadHandlers();

    const result = await installHandler({ target: 'hermes' });

    expect(result).toEqual({ success: true, status: 'installed', message: undefined });
    expect(execFileMock).toHaveBeenCalledWith(
      'python3',
      [
        '-m',
        'pip',
        'install',
        '--user',
        '--disable-pip-version-check',
        '-i',
        'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple',
        'uv',
      ],
      expect.any(Object),
      expect.any(Function)
    );
  });
});
