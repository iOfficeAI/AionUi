/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { httpRequest } from '@/common/adapter/httpBridge';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import type {
  ManagedCliInstallOptions,
  ManagedCliInstallResult,
  ManagedCliInstallTarget,
} from '@/common/types/agent/managedCliInstaller';
import { newApiDesktopAccountService } from './services/NewApiDesktopAccountService';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type ExecCommandOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

type ManagedCliDescriptor = {
  target: ManagedCliInstallTarget;
  detectCommand: string;
  install: () => Promise<void>;
  uninstall: () => Promise<void>;
};

const NPM_DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const NPM_MIRROR_REGISTRY = 'https://registry.npmmirror.com';
const HERMES_HOME_DIR = path.join(os.homedir(), '.hermes');
const HERMES_VENV_DIR = path.join(HERMES_HOME_DIR, 'hermes-agent', 'venv');
function getHermesShimName(): string {
  return process.platform === 'win32' ? 'hermes.cmd' : 'hermes';
}

function getHermesVenvBinaryPath(venvDir: string): string {
  if (process.platform === 'win32') {
    return path.join(venvDir, 'Scripts', 'hermes.exe');
  }
  return path.join(venvDir, 'bin', 'hermes');
}

const HERMES_BIN_DIR = path.join(os.homedir(), '.local', 'bin');
const HERMES_SHIM_PATH = path.join(HERMES_BIN_DIR, getHermesShimName());
const OPENCODE_CONFIG_ENV_NAME = 'OPENCODE_CONFIG';
const XDG_CONFIG_HOME_ENV_NAME = 'XDG_CONFIG_HOME';
const AIONUI_DEV_DIR = path.join(os.homedir(), '.pounding-dev');
const MANAGED_OPENCODE_CONFIG_PATH = path.join(AIONUI_DEV_DIR, 'managed-opencode', 'opencode.json');
const MANAGED_OPENCODE_XDG_HOME = path.join(AIONUI_DEV_DIR, 'xdg-config');
const BUN_HOME_DIR = process.env.BUN_INSTALL?.trim() || path.join(os.homedir(), '.bun');
const BUN_BIN_DIR = path.join(BUN_HOME_DIR, 'bin');
const BUN_GLOBAL_NODE_MODULES_DIR = path.join(BUN_HOME_DIR, 'install', 'global', 'node_modules');

function runCommand(command: string, args: string[], options: ExecCommandOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        env: {
          ...process.env,
          ...options.env,
        },
        cwd: options.cwd,
        shell: false,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = [stderr, stdout, error.message].filter(Boolean).join('\n').trim();
          reject(new Error(detail || `${command} ${args.join(' ')} failed`));
          return;
        }
        resolve();
      }
    );

    child.unref?.();
  });
}

function getNpmEnv(registry: string): NodeJS.ProcessEnv {
  return {
    npm_config_registry: registry,
    NPM_CONFIG_REGISTRY: registry,
  };
}

function getNpmCommand(): string {
  return process.env.npm_execpath && fs.existsSync(process.env.npm_execpath) ? process.env.npm_execpath : 'npm';
}

function getBunCommand(): string {
  return process.env.BUN_BINARY?.trim() || 'bun';
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeRm(targetPath: string): void {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

/**
 * Remove a CLI binary from all known global installation paths.
 * npm uninstall -g handles npm's own prefix, but doesn't clean up
 * bun/npm symlinks under other package-manager directories.
 * Supports macOS, Linux, and Windows.
 */
function removeFromKnownPaths(binaryName: string): void {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const candidates = [
    // bun global bin
    path.join(BUN_BIN_DIR, `${binaryName}${ext}`),
    // npm global bin (homebrew / asdf / nvm common prefixes)
    path.join(os.homedir(), '.local', 'bin', binaryName),
    path.join(os.homedir(), 'node_modules', '.bin', binaryName),
    // npm default global prefix on macOS / Linux
    path.join('/usr/local', 'bin', binaryName),
    path.join(os.homedir(), '.npm-global', 'bin', binaryName),
  ];
  // Windows: npm global prefix is under %APPDATA%/npm
  if (process.platform === 'win32' && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', `${binaryName}.cmd`));
    candidates.push(path.join(process.env.APPDATA, 'npm', `${binaryName}.ps1`));
  }
  // Windows: also check common scoop/choco install dirs
  if (process.platform === 'win32') {
    candidates.push(path.join(os.homedir(), 'scoop', 'apps', binaryName, 'current'));
    candidates.push(path.join(os.homedir(), 'AppData', 'Local', 'Programs', binaryName));
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true });
      }
    } catch {
      // best-effort
    }
  }
}

function getOpencodePlatformPackage(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return 'opencode-darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'opencode-darwin-x64';
  if (platform === 'linux' && arch === 'arm64') return 'opencode-linux-arm64';
  if (platform === 'linux' && arch === 'x64') return 'opencode-linux-x64';
  if (platform === 'win32' && arch === 'arm64') return 'opencode-windows-arm64';
  if (platform === 'win32' && arch === 'x64') return 'opencode-windows-x64';
  throw new Error(`Unsupported OpenCode platform package for ${platform}-${arch}`);
}

function getOpencodeBinaryTargetPath(): string {
  return path.join(BUN_BIN_DIR, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
}

function getOpencodePlatformBinaryPath(): string {
  return path.join(
    BUN_GLOBAL_NODE_MODULES_DIR,
    getOpencodePlatformPackage(),
    'bin',
    process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  );
}

function writeOpencodeShim(binaryOverride?: string): void {
  const targetBinary = binaryOverride || findOpencodePlatformBinary();
  if (!targetBinary) {
    throw new Error(
      `OpenCode platform binary not found. ` + `Searched under ${BUN_GLOBAL_NODE_MODULES_DIR}/opencode-*/bin/`
    );
  }
  // Pre-create managed config directories to prevent permission issues on
  // systems where ~/.config is root-owned (macOS) or otherwise unwritable.
  // XDG_CONFIG_HOME in the shim redirects OpenCode away from ~/.config.
  ensureDir(MANAGED_OPENCODE_XDG_HOME);
  // Also pre-create a dedicated subfolder so OpenCode's startup probe
  // (which checks ~/.config/opencode or $XDG_CONFIG_HOME/opencode) succeeds.
  const managedOpencodeConfigDir = path.join(MANAGED_OPENCODE_XDG_HOME, 'opencode');
  ensureDir(managedOpencodeConfigDir);
  ensureDir(path.dirname(MANAGED_OPENCODE_CONFIG_PATH));
  // Touch the managed config file so it exists (empty JSON object) — the
  // runtime sync (writeOpencodeConfigForProviderSync) will fill it later.
  if (!fs.existsSync(MANAGED_OPENCODE_CONFIG_PATH)) {
    fs.writeFileSync(MANAGED_OPENCODE_CONFIG_PATH, '{}\n', { encoding: 'utf8', mode: 0o600 });
  }

  const shimPath = getOpencodeBinaryTargetPath();
  ensureDir(path.dirname(shimPath));
  safeRm(shimPath);
  if (process.platform === 'win32') {
    const shim = [
      '@echo off',
      `set "${XDG_CONFIG_HOME_ENV_NAME}=${MANAGED_OPENCODE_XDG_HOME}"`,
      `set "${OPENCODE_CONFIG_ENV_NAME}=${MANAGED_OPENCODE_CONFIG_PATH}"`,
      `"${targetBinary}" %*`,
      '',
    ].join('\r\n');
    fs.writeFileSync(shimPath, shim, { encoding: 'utf8' });
    return;
  }
  const shim = [
    '#!/usr/bin/env bash',
    `export ${XDG_CONFIG_HOME_ENV_NAME}=${JSON.stringify(MANAGED_OPENCODE_XDG_HOME)}`,
    `export ${OPENCODE_CONFIG_ENV_NAME}=${JSON.stringify(MANAGED_OPENCODE_CONFIG_PATH)}`,
    `exec ${JSON.stringify(targetBinary)} "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(shimPath, shim, { encoding: 'utf8', mode: 0o755 });
}

async function installNpmPackage(packageName: string): Promise<void> {
  let lastError: unknown;
  for (const registry of [NPM_MIRROR_REGISTRY, NPM_DEFAULT_REGISTRY]) {
    try {
      await runCommand(getNpmCommand(), ['install', '-g', packageName], {
        env: getNpmEnv(registry),
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to install ${packageName}`);
}

async function uninstallNpmPackage(packageName: string): Promise<void> {
  try {
    await runCommand(getNpmCommand(), ['uninstall', '-g', packageName]);
  } catch {
    // ignore uninstall miss
  }
}

async function installBunPackage(packageName: string): Promise<void> {
  let lastError: unknown;
  for (const registry of [NPM_MIRROR_REGISTRY, NPM_DEFAULT_REGISTRY]) {
    try {
      await runCommand(getBunCommand(), ['add', '-g', packageName], {
        env: getNpmEnv(registry),
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to install ${packageName}`);
}

async function uninstallBunPackage(packageName: string): Promise<void> {
  try {
    await runCommand(getBunCommand(), ['remove', '-g', packageName]);
  } catch {
    // ignore uninstall miss
  }
}

function writeHermesShim(): void {
  ensureDir(HERMES_BIN_DIR);
  const hermesBinary = getHermesVenvBinaryPath(HERMES_VENV_DIR);
  if (process.platform === 'win32') {
    const shim = ['@echo off', 'set PYTHONPATH=', 'set PYTHONHOME=', `"${hermesBinary}" %*`, ''].join('\r\n');
    fs.writeFileSync(HERMES_SHIM_PATH, shim, { encoding: 'utf8' });
    return;
  }
  const shim = ['#!/usr/bin/env bash', 'unset PYTHONPATH', 'unset PYTHONHOME', `exec "${hermesBinary}" "$@"`, ''].join(
    '\n'
  );
  fs.writeFileSync(HERMES_SHIM_PATH, shim, { encoding: 'utf8', mode: 0o755 });
}

async function installHermes(): Promise<void> {
  const uvBinary = process.env.UV_BINARY?.trim() || 'uv';
  const packageName = 'hermes-agent[acp]';
  const indexUrls = ['https://pypi.tuna.tsinghua.edu.cn/simple', 'https://pypi.org/simple'];

  ensureDir(path.dirname(HERMES_VENV_DIR));
  const venvArgs = fs.existsSync(HERMES_VENV_DIR) ? ['venv', '--clear', HERMES_VENV_DIR] : ['venv', HERMES_VENV_DIR];
  await runCommand(uvBinary, venvArgs);
  let lastError: unknown;
  for (const indexUrl of indexUrls) {
    try {
      const venvPython =
        process.platform === 'win32'
          ? path.join(HERMES_VENV_DIR, 'Scripts', 'python.exe')
          : path.join(HERMES_VENV_DIR, 'bin', 'python');
      await runCommand(uvBinary, ['pip', 'install', '--python', venvPython, '-U', packageName], {
        env: {
          UV_INDEX_URL: indexUrl,
          PIP_INDEX_URL: indexUrl,
        },
      });
      writeHermesShim();
      // Verify the shim target binary exists — a broken shim (venv binary
      // missing after install) would cause `hermes acp` to exit 126 with
      // "No such file or directory" at runtime, which is
      // indistinguishable from a missing install.
      const shimTarget = getHermesVenvBinaryPath(HERMES_VENV_DIR);
      if (!fs.existsSync(shimTarget)) {
        throw new Error(
          `Hermes install: venv binary not found at expected path "${shimTarget}". ` +
            `The shim at "${HERMES_SHIM_PATH}" will point to a non-existent file. ` +
            `Try: rm -rf ${HERMES_VENV_DIR} && ${uvBinary} venv ${HERMES_VENV_DIR} ` +
            `&& ${uvBinary} pip install --python ${venvPython} -U ${packageName}`
        );
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to install hermes-agent');
}

async function uninstallHermes(): Promise<void> {
  safeRm(path.join(HERMES_HOME_DIR, 'hermes-agent'));
  safeRm(HERMES_SHIM_PATH);
}

/** Search for the opencode platform binary under bun's global node_modules. */
function findOpencodePlatformBinary(): string | null {
  const platformPkg = getOpencodePlatformPackage();
  const binaryName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  // Check exact expected path first
  const exactPath = path.join(BUN_GLOBAL_NODE_MODULES_DIR, platformPkg, 'bin', binaryName);
  if (fs.existsSync(exactPath)) return exactPath;
  // Search all packages that start with "opencode-" under bun's global node_modules
  try {
    if (fs.existsSync(BUN_GLOBAL_NODE_MODULES_DIR)) {
      const entries = fs.readdirSync(BUN_GLOBAL_NODE_MODULES_DIR);
      for (const entry of entries) {
        if (!entry.startsWith('opencode-')) continue;
        const candidate = path.join(BUN_GLOBAL_NODE_MODULES_DIR, entry, 'bin', binaryName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // noop
  }
  return null;
}

async function installOpenCode(): Promise<void> {
  ensureDir(BUN_HOME_DIR);
  ensureDir(BUN_GLOBAL_NODE_MODULES_DIR);

  // 1. Install the meta-package (postinstall may succeed or fail depending on
  //    bun's npm compatibility — we handle both cases below).
  let metaInstallError: unknown;
  try {
    await installBunPackage('opencode-ai');
  } catch (error) {
    metaInstallError = error;
  }

  // 2. Try installing the platform-specific package directly.
  //    On Windows / Linux / macOS the package name differs (e.g.
  //    opencode-darwin-arm64, opencode-windows-x64).
  const platformPkg = getOpencodePlatformPackage();
  if (metaInstallError) {
    // If meta-package failed, re-throw unexpected errors — but the expected
    // "postinstall" / "platform package missing" errors are swallowed.
    const msg = metaInstallError instanceof Error ? metaInstallError.message : String(metaInstallError);
    if (
      !msg.includes('opencode-darwin') &&
      !msg.includes('opencode-windows') &&
      !msg.includes('opencode-linux') &&
      !msg.includes('failed to install the right opencode CLI package')
    ) {
      throw metaInstallError;
    }
  }
  await installBunPackage(platformPkg);

  // 3. Find the binary (exact path may vary by bun version / platform).
  const foundBinary = findOpencodePlatformBinary();
  if (foundBinary) {
    writeOpencodeShim(foundBinary);
    return;
  }

  // 4. Last resort: try `bun add -g opencode-ai` one more time (bun may have
  //    fixed its internal state after the platform package was installed).
  if (metaInstallError) {
    await installBunPackage('opencode-ai');
    const retryBinary = findOpencodePlatformBinary();
    if (retryBinary) {
      writeOpencodeShim(retryBinary);
      return;
    }
  }

  throw new Error(
    `OpenCode install failed: platform binary not found under ${BUN_GLOBAL_NODE_MODULES_DIR}. ` +
      `Try running: bun add -g opencode-ai && bun add -g ${platformPkg}`
  );
}

async function uninstallOpenCode(): Promise<void> {
  await uninstallBunPackage('opencode-ai');
  await uninstallBunPackage(getOpencodePlatformPackage());
  safeRm(getOpencodeBinaryTargetPath());
  safeRm(path.join(BUN_GLOBAL_NODE_MODULES_DIR, 'opencode-ai'));
  safeRm(path.join(BUN_GLOBAL_NODE_MODULES_DIR, getOpencodePlatformPackage()));
  safeRm(MANAGED_OPENCODE_XDG_HOME);
}

async function commandExists(command: string): Promise<boolean> {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  try {
    await runCommand(locator, [command]);
    return true;
  } catch {
    return false;
  }
}

async function refreshAgents(): Promise<void> {
  await httpRequest('POST', '/api/agents/refresh');
}

const DESCRIPTORS: Record<ManagedCliInstallTarget, ManagedCliDescriptor> = {
  claude: {
    target: 'claude',
    detectCommand: 'claude',
    install: async () => installNpmPackage('@anthropic-ai/claude-code'),
    uninstall: async () => {
      await uninstallNpmPackage('@anthropic-ai/claude-code');
      removeFromKnownPaths('claude');
    },
  },
  hermes: {
    target: 'hermes',
    detectCommand: 'hermes',
    install: installHermes,
    uninstall: uninstallHermes,
  },
  opencode: {
    target: 'opencode',
    detectCommand: 'opencode',
    install: installOpenCode,
    uninstall: uninstallOpenCode,
  },
  openclaw: {
    target: 'openclaw',
    detectCommand: 'openclaw',
    install: async () => installNpmPackage('openclaw'),
    uninstall: async () => {
      await uninstallNpmPackage('openclaw');
      removeFromKnownPaths('openclaw');
    },
  },
};

async function syncAfterInstall(target: ManagedCliInstallTarget): Promise<void> {
  await newApiDesktopAccountService.reconcileManagedRuntimeState({ cliTarget: target });
  await refreshAgents();
}

async function syncAfterUninstall(target: ManagedCliInstallTarget): Promise<void> {
  await newApiDesktopAccountService.clearManagedRuntimeForCliTarget(target);
  await refreshAgents();
}

async function installManagedCli(input: ManagedCliInstallOptions): Promise<ManagedCliInstallResult> {
  const descriptor = DESCRIPTORS[input.target];
  if (!descriptor) {
    return {
      success: false,
      status: 'failed',
      message: `Unsupported target: ${String(input.target)}`,
    };
  }

  try {
    await descriptor.install();
    await syncAfterInstall(descriptor.target);
    const installed = await commandExists(descriptor.detectCommand);
    return {
      success: installed,
      status: installed ? 'installed' : 'failed',
      message: installed ? undefined : `${descriptor.detectCommand} is still not available in PATH`,
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function uninstallManagedCli(target: ManagedCliInstallTarget): Promise<ManagedCliInstallResult> {
  const descriptor = DESCRIPTORS[target];
  if (!descriptor) {
    return {
      success: false,
      status: 'failed',
      message: `Unsupported target: ${String(target)}`,
    };
  }

  try {
    await descriptor.uninstall();
    await syncAfterUninstall(target);
    const installed = await commandExists(descriptor.detectCommand);
    return {
      success: !installed,
      status: installed ? 'failed' : 'not_installed',
      message: installed ? `${descriptor.detectCommand} is still available in PATH` : undefined,
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// Exported for dynamic import by the Hermes config writer (NewApiDesktopAccountService)
// so broken-shim detection can trigger a venv repair without creating a module-load cycle.
export { installHermes };

export function initManagedCliInstallerBridge(): void {
  ipcBridge.managedCliInstaller.install.provider(async (input) => installManagedCli(input));
  ipcBridge.managedCliInstaller.uninstall.provider(async ({ target }) => uninstallManagedCli(target));
}
