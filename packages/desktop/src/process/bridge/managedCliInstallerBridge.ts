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
const HERMES_BIN_DIR = path.join(os.homedir(), '.local', 'bin');
const HERMES_SHIM_PATH = path.join(HERMES_BIN_DIR, 'hermes');
const OPENCODE_CONFIG_ENV_NAME = 'OPENCODE_CONFIG';
const XDG_CONFIG_HOME_ENV_NAME = 'XDG_CONFIG_HOME';
const AIONUI_DEV_DIR = path.join(os.homedir(), '.aionui-dev');
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

function writeOpencodeShim(): void {
  const targetBinary = getOpencodePlatformBinaryPath();
  if (!fs.existsSync(targetBinary)) {
    throw new Error(`OpenCode platform binary not found at ${targetBinary}`);
  }
  ensureDir(BUN_BIN_DIR);
  ensureDir(path.dirname(MANAGED_OPENCODE_CONFIG_PATH));
  ensureDir(MANAGED_OPENCODE_XDG_HOME);
  const shimPath = getOpencodeBinaryTargetPath();
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
  const shim = `#!/usr/bin/env bash
unset PYTHONPATH
unset PYTHONHOME
exec "${path.join(HERMES_VENV_DIR, 'bin', 'hermes')}" "$@"
`;
  fs.writeFileSync(HERMES_SHIM_PATH, shim, { encoding: 'utf8', mode: 0o755 });
}

async function installHermes(): Promise<void> {
  const uvBinary = process.env.UV_BINARY?.trim() || 'uv';
  const packageName = 'hermes-agent';
  const indexUrls = ['https://pypi.tuna.tsinghua.edu.cn/simple', 'https://pypi.org/simple'];

  ensureDir(path.dirname(HERMES_VENV_DIR));
  await runCommand(uvBinary, ['venv', HERMES_VENV_DIR]);
  let lastError: unknown;
  for (const indexUrl of indexUrls) {
    try {
      await runCommand(
        uvBinary,
        ['pip', 'install', '--python', path.join(HERMES_VENV_DIR, 'bin', 'python'), '-U', packageName],
        {
          env: {
            UV_INDEX_URL: indexUrl,
            PIP_INDEX_URL: indexUrl,
          },
        }
      );
      writeHermesShim();
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

async function installOpenCode(): Promise<void> {
  ensureDir(BUN_HOME_DIR);
  ensureDir(BUN_GLOBAL_NODE_MODULES_DIR);
  try {
    await installBunPackage('opencode-ai');
    if (await commandExists('opencode')) {
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('opencode-darwin') && !message.includes('failed to install the right opencode CLI package')) {
      throw error;
    }
  }

  await installBunPackage(getOpencodePlatformPackage());
  writeOpencodeShim();
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
    uninstall: async () => uninstallNpmPackage('@anthropic-ai/claude-code'),
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
    uninstall: async () => uninstallNpmPackage('openclaw'),
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

export function initManagedCliInstallerBridge(): void {
  ipcBridge.managedCliInstaller.install.provider(async (input) => installManagedCli(input));
  ipcBridge.managedCliInstaller.uninstall.provider(async ({ target }) => uninstallManagedCli(target));
}
