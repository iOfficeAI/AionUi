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

import { getPlatformServices } from '@/common/platform';
import { execFile, execFileSync, spawn } from 'child_process';
import { accessSync, existsSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';

/** Enable ACP performance diagnostics via ACP_PERF=1 */
const PERF_LOG = process.env.ACP_PERF === '1';

// ---------------------------------------------------------------------------
// Bundled bun runtime
// ---------------------------------------------------------------------------

/**
 * Get the directory containing the bundled bun binary.
 * Returns the path to `resources/bundled-bun/<platform>-<arch>/` which contains
 * the bun executable. Returns null if the directory doesn't exist.
 */
export function getBundledBunDir(): string | null {
  const resourcesPath = getPlatformServices().paths.isPackaged()
    ? process.resourcesPath
    : path.join(process.cwd(), 'resources');
  const platform = process.platform === 'win32' ? 'win32' : process.platform;
  const arch = process.arch;
  const bunDir = path.join(resourcesPath, 'bundled-bun', `${platform}-${arch}`);
  return existsSync(bunDir) ? bunDir : null;
}

/**
 * Get the path to the user's bun global bin directory.
 * This is where `bun add -g` installs binaries.
 * - macOS/Linux: ~/.bun/bin
 * - Windows: %USERPROFILE%\.bun\bin
 */
export function getBunGlobalBinDir(): string {
  return path.join(os.homedir(), '.bun', 'bin');
}

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
 * Resolve the user's login shell path.
 * Falls back to /bin/zsh on macOS, /bin/bash on Linux, or /bin/sh as last resort.
 * When Electron is launched from Finder/launchd, process.env.SHELL is often unset,
 * so we query the system instead of defaulting to bash.
 */
function resolveLoginShell(): string {
  // macOS: use dscl to read the user's login shell from Directory Service
  if (process.platform === 'darwin') {
    try {
      const shell = execFileSync('dscl', ['.', '-read', `/Users/${os.userInfo().username}`, 'UserShell'], {
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
        .trim()
        .split(/\s+/)
        .pop();
      if (shell && path.isAbsolute(shell)) return shell;
    } catch {
      /* dscl failed, fall through */
    }
    return '/bin/zsh'; // macOS default since Catalina
  }

  // Linux: read /etc/passwd
  if (process.platform === 'linux') {
    try {
      const passwd = execFileSync('getent', ['passwd', os.userInfo().username], {
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const shell = passwd.split(':').pop();
      if (shell && path.isAbsolute(shell)) return shell;
    } catch {
      /* getent failed, fall through */
    }
    return '/bin/bash'; // Linux default
  }

  // Windows: not used (shell env loading is skipped on Windows)
  return process.env.SHELL || '/bin/sh';
}

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
    const shell = resolveLoginShell();
    if (!path.isAbsolute(shell)) {
      console.warn('[ShellEnv] Resolved shell is not an absolute path, skipping shell env loading:', shell);
      return cachedShellEnv;
    }
    // Use -l (login) to load login shell configs (.bash_profile, .zprofile, etc.)
    // NOTE: Do NOT use -i (interactive) — interactive shells call tcsetpgrp() to
    // grab the terminal foreground process group and do not restore it on exit,
    // which prevents Ctrl+C from delivering SIGINT to the server process.
    const output = execFileSync(shell, ['-l', '-c', 'env'], {
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
    console.warn(
      '[ShellEnv] Failed to load shell environment:',
      error instanceof Error ? error.message : String(error)
    );
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
    const shell = resolveLoginShell();
    if (!path.isAbsolute(shell)) {
      console.warn('[ShellEnv] Resolved shell is not an absolute path, skipping async shell env loading:', shell);
      cachedShellEnv = {};
      return cachedShellEnv;
    }

    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        shell,
        ['-l', '-c', 'env'],
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
    console.warn(
      '[ShellEnv] Failed to async load shell environment:',
      error instanceof Error ? error.message : String(error)
    );
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
 * Scan well-known Windows tool installation directories and return any that exist
 * but are not already in the current PATH.
 *
 * On Windows, apps launched via shortcuts or the Start menu may miss user-local
 * tool paths (e.g. npm global packages, nvm-windows, Scoop, Volta) that are
 * added to PATH only when a shell session starts.
 *
 * 扫描 Windows 常见工具安装目录，返回当前 PATH 中缺少的路径。
 */
function getWindowsExtraToolPaths(): string[] {
  if (process.platform !== 'win32') return [];

  const homeDir = os.homedir();
  const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const currentPath = process.env.PATH || '';

  const candidates = [
    // npm global packages (most common - installed with Node.js)
    path.join(appData, 'npm'),
    // Node.js official installer
    path.join(programFiles, 'nodejs'),
    // nvm-windows: %APPDATA%\nvm (the active version symlink lives here)
    process.env.NVM_HOME || path.join(appData, 'nvm'),
    // nvm-windows symlink directory (where the active node version is linked)
    process.env.NVM_SYMLINK || path.join(programFiles, 'nodejs'),
    // fnm-windows: FNM_MULTISHELL_PATH is set per-shell session
    ...(process.env.FNM_MULTISHELL_PATH ? [process.env.FNM_MULTISHELL_PATH] : []),
    path.join(localAppData, 'fnm_multishells'),
    // Volta: cross-platform Node version manager
    path.join(homeDir, '.volta', 'bin'),
    // Scoop: Windows package manager
    process.env.SCOOP ? path.join(process.env.SCOOP, 'shims') : path.join(homeDir, 'scoop', 'shims'),
    // pnpm global store shims
    path.join(localAppData, 'pnpm'),
    // Chocolatey
    path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin'),
    // Git for Windows — provides cygpath, git, and POSIX utilities.
    // Claude Code's agent-sdk calls `cygpath` internally on Windows; if this
    // directory is missing from PATH the SDK fails with "cygpath: not found".
    path.join(programFiles, 'Git', 'cmd'),
    path.join(programFiles, 'Git', 'bin'),
    path.join(programFiles, 'Git', 'usr', 'bin'),
    path.join(programFilesX86, 'Git', 'cmd'),
    path.join(programFilesX86, 'Git', 'bin'),
    path.join(programFilesX86, 'Git', 'usr', 'bin'),
    // Cygwin — alternative source for cygpath
    'C:\\cygwin64\\bin',
    'C:\\cygwin\\bin',
    // bun global packages
    getBunGlobalBinDir(),
  ];

  return candidates.filter((p) => existsSync(p) && !currentPath.includes(p));
}

/**
 * Scan well-known POSIX tool installation directories and return any that exist
 * but are not already in the current PATH.
 *
 * Similar to getWindowsExtraToolPaths but for macOS/Linux.
 * Covers global bin directories for bun, cargo, go, deno, etc.
 */
function getPosixExtraToolPaths(): string[] {
  if (process.platform === 'win32') return [];

  const homeDir = os.homedir();
  const currentPath = process.env.PATH || '';

  const candidates = [
    // bun global packages
    getBunGlobalBinDir(),
    // cargo (Rust)
    path.join(homeDir, '.cargo', 'bin'),
    // go
    path.join(homeDir, 'go', 'bin'),
    // deno
    path.join(homeDir, '.deno', 'bin'),
    // local bin (pip, pipx, etc.)
    path.join(homeDir, '.local', 'bin'),
  ];

  return candidates.filter((p) => existsSync(p) && !currentPath.includes(p));
}

/**
 * Get enhanced environment variables by merging shell env with process.env.
 * For PATH, we merge both sources to ensure CLI tools are found regardless of
 * how the app was started (terminal vs Finder/launchd).
 *
 * On Windows, also appends well-known tool paths (npm globals, nvm, volta, scoop)
 * that may not be present when Electron starts from a shortcut.
 *
 * 获取增强的环境变量，合并 shell 环境变量和 process.env。
 * 对于 PATH，合并两个来源以确保无论应用如何启动都能找到 CLI 工具。
 * 在 Windows 上，还会追加常见工具路径（npm 全局包、nvm、volta、scoop 等）。
 */
export function getEnhancedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const shellEnv = loadShellEnvironment();
  const separator = process.platform === 'win32' ? ';' : ':';

  // Merge PATH from both sources (shell env may miss nvm/fnm paths in dev mode)
  // 合并两个来源的 PATH（开发模式下 shell 环境可能缺少 nvm/fnm 路径）
  let mergedPath = mergePaths(process.env.PATH, shellEnv.PATH);

  // On Windows, also append any discovered tool paths not already in PATH
  // 在 Windows 上，追加未在 PATH 中的常见工具路径
  const winExtraPaths = getWindowsExtraToolPaths();
  if (winExtraPaths.length > 0) {
    mergedPath = mergePaths(mergedPath, winExtraPaths.join(';'));
  }

  // On macOS/Linux, append well-known global bin directories (bun, cargo, go, etc.)
  const posixExtraPaths = getPosixExtraToolPaths();
  if (posixExtraPaths.length > 0) {
    mergedPath = mergePaths(mergedPath, posixExtraPaths.join(':'));
  }

  // Prepend bundled bun directory (highest priority — ensures extensions always
  // have access to bun/bunx even if the user hasn't installed it)
  const bundledBunDir = getBundledBunDir();
  if (bundledBunDir) {
    mergedPath = `${bundledBunDir}${separator}${mergedPath}`;
  }

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
  searchPaths.push({
    base: path.join(nvmDir, 'versions', 'node'),
    binSuffix: 'bin',
  });

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
  searchPaths.push({
    base: path.join(homeDir, '.volta', 'tools', 'image', 'node'),
    binSuffix: 'bin',
  });

  const candidates: Array<{
    major: number;
    minor: number;
    patch: number;
    binDir: string;
  }> = [];

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

/**
 * Parse `env` command output into a key-value map.
 * Handles multi-line values correctly by detecting new variable starts
 * with the pattern: KEY=value (KEY must match [A-Za-z_][A-Za-z0-9_]*).
 */
function parseEnvOutput(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  const varStartRe = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)/;
  let currentKey: string | null = null;
  let currentValue: string | null = null;

  for (const line of output.split('\n')) {
    const match = varStartRe.exec(line);
    if (match) {
      // Flush previous variable
      if (currentKey !== null) {
        result[currentKey] = currentValue!;
      }
      currentKey = match[1];
      currentValue = match[2];
    } else if (currentKey !== null) {
      // Continuation of a multi-line value
      currentValue += '\n' + line;
    }
  }
  // Flush last variable
  if (currentKey !== null) {
    result[currentKey] = currentValue!;
  }
  return result;
}

export function getWindowsShellExecutionOptions(): {
  shell?: boolean;
  windowsHide?: boolean;
} {
  return process.platform === 'win32' ? { shell: true, windowsHide: true } : {};
}

/**
 * Resolve a modern npx binary (npm >= 7) from the same directory as the
 * active node binary.  Old standalone npx packages (npm v5/v6 era) don't
 * understand `@scope/package` syntax and fail with
 * "ERROR: You must supply a command."
 *
 * @param env - Environment to use for locating node/npx (should include shell PATH)
 * @returns Absolute path to a modern npx, or bare `npx` as fallback
 */
export function normalizeNpxArgsForBundledBun(args: string[]): string[] {
  return args.filter((arg) => arg !== '-y' && arg !== '--yes' && arg !== '--prefer-offline');
}

export function resolveNpxPath(_env: Record<string, string | undefined>): string {
  const bundledBunDir = getBundledBunDir();
  if (bundledBunDir) {
    return path.join(bundledBunDir, process.platform === 'win32' ? 'bun.exe' : 'bun');
  }

  return process.platform === 'win32' ? 'bun.exe' : 'bun';
}

/**
 * Resolve node.exe and npx-cli.js paths for direct invocation on Windows.
 *
 * On Windows, `.cmd` shims (npm.cmd, npx.cmd) use `%~dp0` to resolve paths
 * relative to the batch file's directory. In certain environments (e.g.,
 * version manager shims, non-standard Node.js installations), `%~dp0` can
 * resolve incorrectly, causing the child process to look for npm-cli.js /
 * npx-cli.js in the wrong directory (e.g., the working directory instead of
 * the Node.js installation).
 *
 * This function returns the absolute paths to node.exe and npx-cli.js so
 * callers can bypass .cmd shims entirely by running `node.exe npx-cli.js`.
 *
 * @param env - Environment to use for locating node (should include shell PATH)
 * @returns Object with nodePath and npxScript, or null on non-Windows / failure
 */
export function resolveNpxDirect(
  env: Record<string, string | undefined>
): { nodePath: string; npxScript: string } | null {
  if (process.platform !== 'win32') return null;

  try {
    const nodePath = execFileSync('where', ['node'], {
      env,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...getWindowsShellExecutionOptions(),
    })
      .trim()
      .split(/\r?\n/)[0];

    const npmBinDir = path.join(path.dirname(nodePath), 'node_modules', 'npm', 'bin');
    const npxCliJs = path.join(npmBinDir, 'npx-cli.js');
    const npmPrefixJs = path.join(npmBinDir, 'npm-prefix.js');

    // npx-cli.js requires npm-prefix.js at runtime — verify both exist
    if (!existsSync(npxCliJs) || !existsSync(npmPrefixJs)) return null;

    // Verify the npx-cli.js actually works
    const versionOutput = execFileSync(nodePath, [npxCliJs, '--version'], {
      env,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();

    const majorVersion = parseInt(versionOutput.split('.')[0], 10);
    if (majorVersion < 7) return null;

    return { nodePath, npxScript: npxCliJs };
  } catch {
    return null;
  }
}

/**
 * Promise-based dedup guard so concurrent callers share one spawn.
 * Without this, a second caller arriving before the first await resolves
 * would see cachedFullShellEnv as {} and return an empty env.
 */
let fullShellEnvPromise: Promise<Record<string, string>> | null = null;

/**
 * Load ALL environment variables from user's login shell (no whitelist).
 * Used by agents (e.g. Codex) that need the complete shell env.
 *
 * Uses `-i -l` (interactive login) so that `.zshrc` / `.bashrc` are loaded,
 * which is where most users export custom env vars (e.g. API keys).
 * The child is spawned with `detached: true` to create a new session
 * (setsid), preventing zsh's `tcsetpgrp()` from hijacking the parent's
 * terminal foreground process group — the root cause of the Ctrl+C
 * regression fixed in 0039b295.
 */
export function loadFullShellEnvironment(): Promise<Record<string, string>> {
  if (!fullShellEnvPromise) {
    fullShellEnvPromise = loadFullShellEnvironmentImpl();
  }
  return fullShellEnvPromise;
}

async function loadFullShellEnvironmentImpl(): Promise<Record<string, string>> {
  if (process.platform === 'win32') return {};

  const shell = resolveLoginShell();
  if (!path.isAbsolute(shell)) return {};

  try {
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      // detached: true → child runs in a new session (setsid on POSIX).
      // Interactive zsh calls tcsetpgrp() to grab the foreground process
      // group, but in a detached session it has no controlling terminal,
      // so the call is harmless and Ctrl+C in the parent is unaffected.
      const child = spawn(shell, ['-i', '-l', '-c', 'env'], {
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, HOME: os.homedir() },
      });
      child.unref();

      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);

      // Safety timeout — don't hang forever if the shell stalls
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // best-effort
        }
        reject(new Error('Timed out loading full shell environment'));
      }, 5000);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Shell exited with code ${code}: ${stderr.substring(0, 200)}`));
        }
      });
    });

    const result = parseEnvOutput(output);
    const varCount = Object.keys(result).length;
    const shellPath = result.PATH || '(empty)';
    console.log(`[ShellEnv] Full shell env loaded: ${varCount} vars, shell=${shell}`);
    console.log(`[ShellEnv] Shell PATH (first 200 chars): ${shellPath.substring(0, 200)}`);
    return result;
  } catch (error) {
    console.warn('[ShellEnv] Failed to load full shell env:', error instanceof Error ? error.message : String(error));
    return {};
  }
}

// ---------------------------------------------------------------------------
// Environment diagnostics — logged once at startup
// ---------------------------------------------------------------------------

const ENV_TAG = '[AionUi:env]';
const ENV_DIVIDER = '═'.repeat(52);

/** Format bytes into a human-readable string (e.g. "16.00 GB"). @internal */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

/**
 * Run a command asynchronously with a timeout.
 * Returns trimmed stdout on success, or `null` on any failure.
 * @internal
 */
export function execAsync(cmd: string, args: string[], timeoutMs = 5_000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        cmd,
        args,
        {
          encoding: 'utf-8',
          timeout: timeoutMs,
          env: process.env,
          windowsHide: true,
          ...getWindowsShellExecutionOptions(),
        },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          resolve((stdout || '').trim().split(/\r?\n/)[0]);
        }
      );
      child.stdin?.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Locate a CLI tool and retrieve its version asynchronously.
 * Returns `{ path, version }` or `null` values when not found.
 * @internal
 */
export async function resolveToolInfo(name: string): Promise<{ toolPath: string | null; version: string | null }> {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const toolPath = await execAsync(whichCmd, [name]);
  if (!toolPath) return { toolPath: null, version: null };

  const version = await execAsync(toolPath, ['--version']);
  return { toolPath, version };
}

/**
 * Log a one-time environment diagnostics snapshot.
 *
 * Collects OS, runtime, CLI tool paths/versions, and memory info, then
 * prints a single consolidated block to the console.  Called as
 * fire-and-forget (`void logEnvironmentDiagnostics()`) so it never blocks
 * the startup path.  The entire body is wrapped in try/catch — diagnostics
 * must never crash the app.
 *
 * Works in both Electron desktop and standalone server modes; Electron-only
 * fields (Electron/Chromium version, userData, logFile) are included only
 * when `process.versions.electron` is present.
 *
 * Output goes to electron-log file via console so users can share the
 * log file for debugging (#1157).
 */
export async function logEnvironmentDiagnostics(): Promise<void> {
  try {
    const isWindows = process.platform === 'win32';
    const isElectron = typeof process.versions.electron === 'string';

    // Electron-specific values — only available in desktop mode
    let appVersion = '(unknown)';
    let mode = 'standalone';
    let userDataPath: string | undefined;
    let logFilePath: string | undefined;
    if (isElectron) {
      // Safe: guarded by the runtime check above
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron');
      appVersion = app.getVersion();
      mode = app.isPackaged ? 'production' : 'development';
      userDataPath = app.getPath('userData');
      logFilePath = app.getPath('logs');
    }

    // Resolve CLI tools in parallel while collecting sync info
    const [nodeInfo, npmInfo, npxInfo, gitInfo] = await Promise.all([
      resolveToolInfo('node'),
      resolveToolInfo('npm'),
      resolveToolInfo('npx'),
      resolveToolInfo('git'),
    ]);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '(unknown)';
    const shell = process.env.SHELL || process.env.ComSpec || '(unknown)';

    const fmt = (label: string, info: { toolPath: string | null; version: string | null }): string => {
      if (!info.toolPath) return `${ENV_TAG}   ${label.padEnd(8)} : (not found)`;
      return `${ENV_TAG}   ${label.padEnd(8)} : ${info.version || '?'}  (${info.toolPath})`;
    };

    const lines: string[] = [
      `${ENV_TAG} ${ENV_DIVIDER}`,
      `${ENV_TAG}   AionUi v${appVersion} (${mode})`,
      `${ENV_TAG}   OS       : ${process.platform} ${os.release()} (${process.arch})`,
    ];

    if (isElectron) {
      lines.push(`${ENV_TAG}   Electron : ${process.versions.electron}`);
      lines.push(`${ENV_TAG}   Chromium : ${process.versions.chrome}`);
    }

    lines.push(
      `${ENV_TAG}   Node     : ${process.version} (built-in)`,
      `${ENV_TAG}   execPath : ${process.execPath}`,
      fmt('node', nodeInfo),
      fmt('npm', npmInfo),
      fmt('npx', npxInfo),
      fmt('git', gitInfo),
      `${ENV_TAG}   Memory   : ${formatBytes(totalMem)} total, ${formatBytes(freeMem)} free`,
      `${ENV_TAG}   Locale   : ${locale}`,
      `${ENV_TAG}   Shell    : ${shell}`
    );

    if (userDataPath) lines.push(`${ENV_TAG}   userData : ${userDataPath}`);
    if (logFilePath) lines.push(`${ENV_TAG}   logFile  : ${logFilePath}`);

    lines.push(`${ENV_TAG}   PATH     : ${(process.env.PATH || '(empty)').substring(0, 300)}`);

    // Windows-specific diagnostics (cygpath / Git tool discovery)
    if (isWindows) {
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const gitUsrBin = path.join(programFiles, 'Git', 'usr', 'bin');
      const cygpathPath = path.join(gitUsrBin, 'cygpath.exe');
      const enhanced = getEnhancedEnv();

      lines.push(
        `${ENV_TAG}   APPDATA  : ${process.env.APPDATA || '(unset)'}`,
        `${ENV_TAG}   LOCALAPP : ${process.env.LOCALAPPDATA || '(unset)'}`,
        `${ENV_TAG}   Git/usr  : ${existsSync(gitUsrBin) ? 'OK' : 'MISSING'} (${gitUsrBin})`,
        `${ENV_TAG}   cygpath  : ${existsSync(cygpathPath) ? 'OK' : 'MISSING'} (${cygpathPath})`,
        `${ENV_TAG}   PATH+    : ${enhanced.PATH.substring(0, 500)}`
      );
    }

    lines.push(`${ENV_TAG} ${ENV_DIVIDER}`);
    console.log('\n' + lines.join('\n'));
  } catch (error) {
    // Diagnostics must never crash the app — log and move on.
    console.warn('[AionUi:env] Failed to collect environment diagnostics:', error);
  }
}

/**
 * Return the platform-specific path to the npm _npx cache directory.
 *
 * - Windows: %LOCALAPPDATA%\npm-cache\_npx
 * - POSIX:   ~/.npm/_npx
 */
export function getNpxCacheDir(): string {
  const explicitCacheDir = process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE;
  if (explicitCacheDir) {
    return path.join(explicitCacheDir, '_npx');
  }

  if (process.platform === 'win32') {
    const npmCacheBase = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'npm-cache'
    );
    return path.join(npmCacheBase, '_npx');
  }

  const homeDir = os.homedir();
  const posixCacheCandidates = [path.join(homeDir, '.npm-cache'), path.join(homeDir, '.npm')];
  const npmCacheBase = posixCacheCandidates.find((candidate) => existsSync(candidate)) || posixCacheCandidates[0];
  return path.join(npmCacheBase, '_npx');
}
