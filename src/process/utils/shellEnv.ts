/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shell environment utilities for the main process.
 *
 * Loads environment variables from the user's login shell so that child
 * processes spawned by Electron (e.g. npx, codex, goose …) inherit the
 * correct PATH, SSL certificates, and authentication tokens — even when
 * the app is launched from Finder / launchd instead of a terminal.
 */

import { execFile, execFileSync } from 'child_process';
import { accessSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';

/** Enable ACP performance diagnostics via ACP_PERF=1 */
const PERF_LOG = process.env.ACP_PERF === '1';

/**
 * Environment variables to inherit from user's shell.
 * These may not be available when Electron app starts from Finder/launchd.
 *
 * 需要从用户 shell 继承的环境变量。
 * 当 Electron 应用从 Finder/launchd 启动时，这些变量可能不可用。
 */
const SHELL_INHERITED_ENV_VARS = [
  'PATH', // Required for finding CLI tools (e.g., ~/.npm-global/bin, ~/.nvm/...)
  'NODE_EXTRA_CA_CERTS', // Custom CA certificates
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'ANTHROPIC_AUTH_TOKEN', // Claude authentication (#776)
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
] as const;

/** Cache for shell environment (loaded once per session) */
let cachedShellEnv: Record<string, string> | null = null;

/**
 * Load environment variables from user's login shell.
 * Captures variables set in .bashrc, .zshrc, .bash_profile, etc.
 *
 * 从用户的登录 shell 加载环境变量。
 * 捕获 .bashrc、.zshrc、.bash_profile 等配置中设置的变量。
 */
function loadShellEnvironment(): Record<string, string> {
  if (cachedShellEnv !== null) {
    return cachedShellEnv;
  }

  const startTime = Date.now();
  cachedShellEnv = {};

  // Skip on Windows - shell config loading not needed
  if (process.platform === 'win32') {
    if (PERF_LOG) console.log(`[ShellEnv] connect: shell env skipped (Windows) ${Date.now() - startTime}ms`);
    return cachedShellEnv;
  }

  try {
    const shell = process.env.SHELL || '/bin/bash';
    if (!path.isAbsolute(shell)) {
      console.warn('[ShellEnv] SHELL is not an absolute path, skipping shell env loading:', shell);
      return cachedShellEnv;
    }
    // Use -i (interactive) and -l (login) to load all shell configs
    // including .bashrc, .zshrc, .bash_profile, .zprofile, etc.
    const output = execFileSync(shell, ['-i', '-l', '-c', 'env'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: os.homedir() },
    });

    // Parse and capture only the variables we need
    for (const line of output.split('\n')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        const value = line.substring(eqIndex + 1);
        if (SHELL_INHERITED_ENV_VARS.includes(key as (typeof SHELL_INHERITED_ENV_VARS)[number])) {
          cachedShellEnv[key] = value;
        }
      }
    }

    if (PERF_LOG && cachedShellEnv.PATH) {
      console.log('[ShellEnv] Loaded PATH from shell:', cachedShellEnv.PATH.substring(0, 100) + '...');
    }
  } catch (error) {
    // Silent fail - shell environment loading is best-effort
    console.warn('[ShellEnv] Failed to load shell environment:', error instanceof Error ? error.message : String(error));
  }

  if (PERF_LOG) console.log(`[ShellEnv] connect: shell env loaded ${Date.now() - startTime}ms`);
  return cachedShellEnv;
}

/**
 * Async version of loadShellEnvironment() for preloading at app startup.
 * Uses async exec instead of execSync to avoid blocking the main process.
 *
 * 异步版本的 loadShellEnvironment()，用于应用启动时预加载。
 * 使用异步 exec 替代 execSync，避免阻塞主进程。
 */
export async function loadShellEnvironmentAsync(): Promise<Record<string, string>> {
  if (cachedShellEnv !== null) {
    return cachedShellEnv;
  }

  if (process.platform === 'win32') {
    cachedShellEnv = {};
    return cachedShellEnv;
  }

  const startTime = Date.now();

  try {
    const shell = process.env.SHELL || '/bin/bash';
    if (!path.isAbsolute(shell)) {
      console.warn('[ShellEnv] SHELL is not an absolute path, skipping async shell env loading:', shell);
      cachedShellEnv = {};
      return cachedShellEnv;
    }

    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        shell,
        ['-i', '-l', '-c', 'env'],
        {
          encoding: 'utf-8',
          timeout: 5000,
          env: { ...process.env, HOME: os.homedir() },
        },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        }
      );
    });

    const env: Record<string, string> = {};
    for (const line of output.split('\n')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        const value = line.substring(eqIndex + 1);
        if (SHELL_INHERITED_ENV_VARS.includes(key as (typeof SHELL_INHERITED_ENV_VARS)[number])) {
          env[key] = value;
        }
      }
    }

    cachedShellEnv = env;

    if (PERF_LOG && cachedShellEnv.PATH) {
      console.log('[ShellEnv] Preloaded PATH from shell:', cachedShellEnv.PATH.substring(0, 100) + '...');
    }
    if (PERF_LOG) console.log(`[ShellEnv] preload: shell env async loaded ${Date.now() - startTime}ms`);
  } catch (error) {
    cachedShellEnv = {};
    console.warn('[ShellEnv] Failed to async load shell environment:', error instanceof Error ? error.message : String(error));
  }

  return cachedShellEnv;
}

/**
 * Merge two PATH strings, removing duplicates while preserving order.
 *
 * 合并两个 PATH 字符串，去重并保持顺序。
 */
export function mergePaths(path1?: string, path2?: string): string {
  const separator = process.platform === 'win32' ? ';' : ':';
  const paths1 = path1?.split(separator).filter(Boolean) || [];
  const paths2 = path2?.split(separator).filter(Boolean) || [];

  const seen = new Set<string>();
  const merged: string[] = [];

  // Add paths from first source (process.env, typically from terminal)
  for (const p of paths1) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }

  // Add paths from second source (shell env, for Finder/launchd launches)
  for (const p of paths2) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }

  return merged.join(separator);
}

/**
 * Get enhanced environment variables by merging shell env with process.env.
 * For PATH, we merge both sources to ensure CLI tools are found regardless of
 * how the app was started (terminal vs Finder/launchd).
 *
 * 获取增强的环境变量，合并 shell 环境变量和 process.env。
 * 对于 PATH，合并两个来源以确保无论应用如何启动都能找到 CLI 工具。
 */
export function getEnhancedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const shellEnv = loadShellEnvironment();

  // Merge PATH from both sources (shell env may miss nvm/fnm paths in dev mode)
  // 合并两个来源的 PATH（开发模式下 shell 环境可能缺少 nvm/fnm 路径）
  const mergedPath = mergePaths(process.env.PATH, shellEnv.PATH);

  return {
    ...process.env,
    ...shellEnv,
    ...customEnv,
    // PATH must be set after spreading to ensure merged value is used
    // When customEnv.PATH exists, merge it with the already merged path (fix: don't override)
    PATH: customEnv?.PATH ? mergePaths(mergedPath, customEnv.PATH) : mergedPath,
  } as Record<string, string>;
}

/**
 * Scan well-known Node.js version manager directories to find a Node binary
 * that satisfies the minimum version requirement.
 * Supports nvm, fnm, and volta.
 *
 * @returns Absolute path to the bin directory containing a suitable `node`, or null.
 */
export function findSuitableNodeBin(minMajor: number, minMinor: number): string | null {
  const homeDir = os.homedir();
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const searchPaths: Array<{ base: string; binSuffix: string }> = [];

  // nvm: ~/.nvm/versions/node/v20.10.0/bin/
  const nvmDir = process.env.NVM_DIR || path.join(homeDir, '.nvm');
  searchPaths.push({ base: path.join(nvmDir, 'versions', 'node'), binSuffix: 'bin' });

  // fnm (macOS): ~/Library/Application Support/fnm/node-versions/v20.10.0/installation/bin/
  // fnm (Linux): ~/.local/share/fnm/node-versions/v20.10.0/installation/bin/
  if (isMac) {
    searchPaths.push({
      base: path.join(homeDir, 'Library', 'Application Support', 'fnm', 'node-versions'),
      binSuffix: path.join('installation', 'bin'),
    });
  } else if (!isWin) {
    searchPaths.push({
      base: path.join(homeDir, '.local', 'share', 'fnm', 'node-versions'),
      binSuffix: path.join('installation', 'bin'),
    });
  }

  // volta: ~/.volta/tools/image/node/20.10.0/bin/
  searchPaths.push({ base: path.join(homeDir, '.volta', 'tools', 'image', 'node'), binSuffix: 'bin' });

  const candidates: Array<{ major: number; minor: number; patch: number; binDir: string }> = [];

  for (const { base, binSuffix } of searchPaths) {
    try {
      for (const entry of readdirSync(base)) {
        const vStr = entry.replace(/^v/, '');
        const m = vStr.match(/^(\d+)\.(\d+)\.(\d+)/);
        if (!m) continue;

        const maj = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const pat = parseInt(m[3], 10);
        if (maj < minMajor || (maj === minMajor && min < minMinor)) continue;

        const binDir = path.join(base, entry, binSuffix);
        const nodeBin = path.join(binDir, isWin ? 'node.exe' : 'node');
        try {
          accessSync(nodeBin);
          candidates.push({ major: maj, minor: min, patch: pat, binDir });
        } catch {
          /* binary not accessible, skip */
        }
      }
    } catch {
      /* directory doesn't exist, skip */
    }
  }

  if (candidates.length === 0) return null;

  // Pick the latest suitable version
  candidates.sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch);
  return candidates[0].binDir;
}
