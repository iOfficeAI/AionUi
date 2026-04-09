/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Backend-specific ACP connector logic and environment helpers.
 * Extracted from AcpConnection to keep the main class focused on
 * process lifecycle, messaging, and session management.
 */

import type { ChildProcess, SpawnOptions } from 'child_process';
import { execFile as execFileCb, execFileSync, spawn } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  CLAUDE_ACP_NPX_PACKAGE,
  CODEBUDDY_ACP_NPX_PACKAGE,
  CODEX_ACP_BRIDGE_VERSION,
  CODEX_ACP_NPX_PACKAGE,
} from '@/common/types/acpTypes';
import {
  findSuitableNodeBin,
  getEnhancedEnv,
  getNpxCacheDir,
  getWindowsShellExecutionOptions,
  loadFullShellEnvironment,
  resolveNpxDirect,
  resolveNpxPath,
} from '@process/utils/shellEnv';
import { mainWarn } from '@process/utils/mainLogger';

const execFile = promisify(execFileCb);

/** Enable ACP performance diagnostics via ACP_PERF=1 */
export const ACP_PERF_LOG = process.env.ACP_PERF === '1';

function resolveCodexAcpPlatformPackage(): string | null {
  if (process.platform === 'win32') {
    if (process.arch === 'x64') {
      return '@zed-industries/codex-acp-win32-x64';
    }

    if (process.arch === 'arm64') {
      return '@zed-industries/codex-acp-win32-arm64';
    }
  }

  if (process.platform === 'linux') {
    if (process.arch === 'x64') {
      return '@zed-industries/codex-acp-linux-x64';
    }

    if (process.arch === 'arm64') {
      return '@zed-industries/codex-acp-linux-arm64';
    }
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'x64') {
      return '@zed-industries/codex-acp-darwin-x64';
    }

    if (process.arch === 'arm64') {
      return '@zed-industries/codex-acp-darwin-arm64';
    }
  }

  return null;
}

function resolveCodexAcpPlatformPackageSpecifier(packageName: string): string {
  return process.platform === 'win32' ? `${packageName}@${CODEX_ACP_BRIDGE_VERSION}` : packageName;
}

function resolvePreferredCodexAcpPlatformPackage(): string | null {
  const packageName = resolveCodexAcpPlatformPackage();
  return packageName ? resolveCodexAcpPlatformPackageSpecifier(packageName) : null;
}

function shouldPreferDirectCodexAcpPackage(): boolean {
  return process.platform === 'win32' || process.platform === 'linux';
}

function extractCodexPlatformPackageFromError(errorMessage: string): string | null {
  const packageMatch = errorMessage.match(/Cannot find package '(@zed-industries\/codex-acp-[^']+)'/i);
  if (packageMatch) {
    return packageMatch[1];
  }

  const binaryMatch = errorMessage.match(/Failed to locate (@zed-industries\/codex-acp-[^\s]+) binary/i);
  if (binaryMatch) {
    return binaryMatch[1];
  }

  return null;
}

function isCodexMetaPackageOptionalDependencyError(errorMessage: string): boolean {
  return (
    errorMessage.includes('optional dependency was not installed') ||
    (errorMessage.includes('@zed-industries/codex-acp') &&
      /ERR_MODULE_NOT_FOUND|Cannot find package|Failed to locate .* binary/i.test(errorMessage))
  );
}

// ── Environment helpers ─────────────────────────────────────────────

/**
 * Prepare a clean environment for ACP backends.
 *
 * Merges the full user shell environment (including custom env vars like
 * API keys exported in .zshrc) with the enhanced env (PATH merging,
 * bundled tool paths). Then removes Electron-injected NODE_OPTIONS,
 * npm lifecycle vars, and other env vars that interfere with child
 * Node.js processes.
 */
export async function prepareCleanEnv(): Promise<Record<string, string | undefined>> {
  const fullShellEnv = await loadFullShellEnvironment();
  const cleanEnv = getEnhancedEnv();

  // Merge full shell env as base, then overlay getEnhancedEnv on top
  // so that PATH merging and bundled bun injection are preserved,
  // while user-defined vars (e.g. SSS_API_KEY) from .zshrc are included.
  const merged: Record<string, string | undefined> = {
    ...fullShellEnv,
    ...cleanEnv,
  };

  delete merged.NODE_OPTIONS;
  delete merged.NODE_INSPECT;
  delete merged.NODE_DEBUG;
  // Remove CLAUDECODE env var to prevent claude-agent-sdk from detecting
  // a nested session when AionUi itself is launched from Claude Code.
  delete merged.CLAUDECODE;
  // Strip npm lifecycle vars inherited from parent `npm start` process.
  // These (npm_config_*, npm_lifecycle_*, npm_package_*) can cause npx to
  // behave as if running inside an npm script, interfering with package
  // resolution and child process startup.
  for (const key of Object.keys(merged)) {
    if (key.startsWith('npm_')) {
      delete merged[key];
    }
  }
  return merged;
}

/**
 * Pre-check Node.js version and auto-correct PATH if too old.
 * Requires Node >= minMajor.minMinor for ACP backends.
 * Mutates cleanEnv.PATH when auto-correction is needed.
 */
export function ensureMinNodeVersion(
  cleanEnv: Record<string, string | undefined>,
  minMajor: number,
  minMinor: number,
  backendLabel: string
): void {
  const isWindows = process.platform === 'win32';
  let versionTooOld = false;
  let detectedVersion = '';

  try {
    detectedVersion = execFileSync(isWindows ? 'node.exe' : 'node', ['--version'], {
      env: cleanEnv,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const match = detectedVersion.match(/^v(\d+)\.(\d+)\./);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < minMajor || (major === minMajor && minor < minMinor)) {
        versionTooOld = true;
      }
    }
  } catch {
    // node not found — let spawn attempt handle it
    console.warn('[ACP] Node.js version check skipped: node not found in PATH');
  }

  if (versionTooOld) {
    const suitableBinDir = findSuitableNodeBin(minMajor, minMinor);
    if (suitableBinDir) {
      const sep = isWindows ? ';' : ':';
      cleanEnv.PATH = suitableBinDir + sep + (cleanEnv.PATH || '');

      // Verify the corrected PATH actually resolves to a good node (npx uses the same PATH)
      try {
        const correctedVersion = execFileSync(isWindows ? 'node.exe' : 'node', ['--version'], {
          env: cleanEnv,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        // Version auto-corrected silently
      } catch {
        console.warn(`[ACP] PATH corrected with ${suitableBinDir} but node verification failed — proceeding anyway`);
      }
    } else {
      throw new Error(
        `Node.js ${detectedVersion} is too old for ${backendLabel}. ` +
          `Minimum required: v${minMajor}.${minMinor}.0. ` +
          `Please upgrade Node.js: https://nodejs.org/`
      );
    }
  }
}

// ── Generic spawn config ────────────────────────────────────────────

/**
 * Creates spawn configuration for ACP CLI commands.
 * Exported for unit testing.
 *
 * @param cliPath - CLI command path (e.g., 'goose', 'npx @pkg/cli')
 * @param workingDir - Working directory for the spawned process
 * @param acpArgs - Arguments to enable ACP mode (e.g., ['acp'] for goose, ['--acp'] for auggie, ['exec','--output-format','acp'] for droid)
 * @param customEnv - Custom environment variables
 * @param prebuiltEnv - Pre-built env to use directly (skips internal getEnhancedEnv)
 */
export function createGenericSpawnConfig(
  cliPath: string,
  workingDir: string,
  acpArgs?: string[],
  customEnv?: Record<string, string>,
  prebuiltEnv?: Record<string, string>
) {
  const isWindows = process.platform === 'win32';
  // Use prebuilt env if provided (already cleaned by caller), otherwise build from shell env
  const env = prebuiltEnv ?? getEnhancedEnv(customEnv);

  // Default to --experimental-acp only if acpArgs is strictly undefined.
  // This allows passing an empty array [] to bypass default flags.
  const effectiveAcpArgs = acpArgs === undefined ? ['--experimental-acp'] : acpArgs;

  let spawnCommand: string;
  let spawnArgs: string[];

  if (cliPath.startsWith('npx ')) {
    // For "npx @package/name [extra-args]", split into command and arguments
    const parts = cliPath.split(' ').filter(Boolean);
    spawnCommand = resolveNpxPath(env);
    spawnArgs = [...parts.slice(1), ...effectiveAcpArgs];
  } else if (isWindows) {
    // On Windows with shell: true, let cmd.exe handle the full command string.
    // This correctly supports paths with spaces (e.g., "C:\Program Files\agent.exe")
    // and commands with inline args (e.g., "goose acp" or "node path/to/file.js").
    //
    // chcp 65001: switch console to UTF-8 so stderr/stdout doesn't get garbled
    // (Chinese Windows defaults to CP936/GBK).
    // Quotes around cliPath handle paths with spaces (e.g. "C:\Program Files\agent.exe").
    spawnCommand = `chcp 65001 >nul && "${cliPath}"`;
    spawnArgs = effectiveAcpArgs;
  } else {
    // Unix: simple command or path. If cliPath contains spaces (e.g., "goose acp"),
    // parse into command + inline args.
    const parts = cliPath.split(/\s+/);
    spawnCommand = parts[0];
    spawnArgs = [...parts.slice(1), ...effectiveAcpArgs];
  }

  const options: SpawnOptions = {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    shell: isWindows,
  };

  return {
    command: spawnCommand,
    args: spawnArgs,
    options,
  };
}

// ── Spawn result type ───────────────────────────────────────────────

export type SpawnResult = { child: ChildProcess; isDetached: boolean };

/** Return type for npx backend prepare functions (prepareClaude, prepareCodex, prepareCodebuddy). */
export type NpxPrepareResult = {
  cleanEnv: Record<string, string | undefined>;
  npxCommand: string;
  /**
   * Windows-only: absolute paths for direct `node.exe npx-cli.js` invocation,
   * bypassing `.cmd` shims whose `%~dp0` can resolve to the wrong directory.
   */
  directInvoke?: { nodePath: string; npxScript: string };
  extraArgs?: string[];
};

// ── Backend-specific connectors ─────────────────────────────────────

/**
 * Spawn an npx-based ACP backend package.
 * Used by Claude, Codex, and CodeBuddy connectors.
 */
export function spawnNpxBackend(
  backend: string,
  npxPackage: string,
  npxCommand: string,
  cleanEnv: Record<string, string | undefined>,
  workingDir: string,
  isWindows: boolean,
  preferOffline: boolean,
  {
    extraArgs = [],
    detached = false,
    directInvoke,
  }: {
    extraArgs?: string[];
    detached?: boolean;
    /** Windows: bypass .cmd shims with direct node.exe + npx-cli.js invocation */
    directInvoke?: { nodePath: string; npxScript: string };
  } = {}
): SpawnResult {
  const spawnArgs = ['--yes', ...(preferOffline ? ['--prefer-offline'] : []), npxPackage, ...extraArgs];

  const spawnStart = Date.now();
  // detached: true creates a new session (setsid) so the child has no controlling terminal.
  // Required for backends (e.g. CodeBuddy) that write to /dev/tty — without it, SIGTTOU
  // would suspend the entire Electron process group and freeze the UI.
  // On Windows, prefix with chcp 65001 to switch console to UTF-8, preventing GBK garbling.
  let effectiveCommand: string;
  if (isWindows && directInvoke) {
    // Bypass .cmd shims: invoke node.exe with npx-cli.js directly.
    // .cmd batch files use %~dp0 to resolve sibling paths — this can break when the
    // working directory or Node.js version manager shims interfere with path resolution,
    // producing "Cannot find module '<cwd>\node_modules\npm\bin\npm-cli.js'" errors.
    effectiveCommand = `chcp 65001 >nul && "${directInvoke.nodePath}" "${directInvoke.npxScript}"`;
  } else {
    effectiveCommand = isWindows ? `chcp 65001 >nul && "${npxCommand}"` : npxCommand;
  }
  const child = spawn(effectiveCommand, spawnArgs, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: cleanEnv,
    shell: isWindows,
    detached,
  });
  // Prevent the detached child from keeping the parent alive when the parent wants to exit normally.
  if (detached) {
    child.unref();
  }
  if (ACP_PERF_LOG) {
    console.log(`[ACP-PERF] ${backend}: process spawned ${Date.now() - spawnStart}ms (preferOffline=${preferOffline})`);
  }

  return { child, isDetached: detached };
}

/** Prepare clean env + resolve npx for Claude ACP bridge. */
async function prepareClaude(): Promise<NpxPrepareResult> {
  const cleanEnv = await prepareCleanEnv();
  ensureMinNodeVersion(cleanEnv, 20, 10, 'Claude ACP bridge');
  return { cleanEnv, npxCommand: resolveNpxPath(cleanEnv), directInvoke: resolveNpxDirect(cleanEnv) ?? undefined };
}

/** Prepare clean env + resolve npx + run diagnostics for Codex ACP bridge. */
async function prepareCodex(codexAcpPackage: string = CODEX_ACP_NPX_PACKAGE): Promise<NpxPrepareResult> {
  const cleanEnv = await prepareCleanEnv();
  ensureMinNodeVersion(cleanEnv, 20, 10, 'Codex ACP bridge');

  const codexCommand = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const codexExecOptions = {
    env: cleanEnv,
    timeout: 5000,
    windowsHide: true,
    ...getWindowsShellExecutionOptions(),
  };
  const diagnostics: {
    bridgeVersion: string;
    bridgePackage: string;
    codexCliVersion: string;
    loginStatus: string;
    hasCodexApiKey: boolean;
    hasOpenAiApiKey: boolean;
    hasChatGptSession: boolean;
  } = {
    bridgeVersion: CODEX_ACP_BRIDGE_VERSION,
    bridgePackage: codexAcpPackage,
    codexCliVersion: 'unknown',
    loginStatus: 'unknown',
    hasCodexApiKey: Boolean(cleanEnv.CODEX_API_KEY),
    hasOpenAiApiKey: Boolean(cleanEnv.OPENAI_API_KEY),
    hasChatGptSession: false,
  };

  try {
    const { stdout } = await execFile(codexCommand, ['--version'], codexExecOptions);
    diagnostics.codexCliVersion = stdout.trim() || diagnostics.codexCliVersion;
  } catch (error) {
    mainWarn('[ACP codex]', 'Failed to read codex CLI version', error);
  }

  try {
    const { stdout } = await execFile(codexCommand, ['login', 'status'], codexExecOptions);
    diagnostics.loginStatus = stdout.trim() || diagnostics.loginStatus;
    diagnostics.hasChatGptSession = /chatgpt/i.test(diagnostics.loginStatus);
  } catch (error) {
    mainWarn('[ACP codex]', 'Failed to read codex login status', error);
  }

  return { cleanEnv, npxCommand: resolveNpxPath(cleanEnv), directInvoke: resolveNpxDirect(cleanEnv) ?? undefined };
}

async function resolveCachedCodexAcpBinary(): Promise<{ binaryPath: string; packageSpecifier: string } | null> {
  const packageName = resolveCodexAcpPlatformPackage();
  if (!packageName) {
    return null;
  }

  const packageDirName = packageName.replace('@zed-industries/', '');
  const binaryName = process.platform === 'win32' ? 'codex-acp.exe' : 'codex-acp';
  const npxCacheDir = getNpxCacheDir();

  let entries: string[] = [];
  try {
    entries = await fs.readdir(npxCacheDir);
  } catch {
    return null;
  }

  let selectedBinaryPath: string | null = null;
  let selectedMtimeMs = -1;

  for (const entry of entries) {
    const candidatePath = path.join(
      npxCacheDir,
      entry,
      'node_modules',
      '@zed-industries',
      packageDirName,
      'bin',
      binaryName
    );

    try {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile() && stat.mtimeMs > selectedMtimeMs) {
        selectedBinaryPath = candidatePath;
        selectedMtimeMs = stat.mtimeMs;
      }
    } catch {
      // Ignore cache entries that do not contain this package.
    }
  }

  return selectedBinaryPath
    ? {
        binaryPath: selectedBinaryPath,
        packageSpecifier: resolveCodexAcpPlatformPackageSpecifier(packageName),
      }
    : null;
}

/** Prepare clean env + resolve npx + load MCP config for CodeBuddy. */
async function prepareCodebuddy(): Promise<NpxPrepareResult> {
  const cleanEnv = await prepareCleanEnv();
  ensureMinNodeVersion(cleanEnv, 20, 10, 'CodeBuddy ACP');

  // Load user's MCP config if available (~/.codebuddy/mcp.json)
  // CodeBuddy CLI in --acp mode does not auto-load mcp.json, so we pass it explicitly
  const mcpConfigPath = path.join(os.homedir(), '.codebuddy', 'mcp.json');
  const extraArgs: string[] = [];
  try {
    await fs.access(mcpConfigPath);
    extraArgs.push('--mcp-config', mcpConfigPath);
  } catch {
    mainWarn('[ACP]', 'No CodeBuddy MCP config found, starting without MCP servers');
  }

  return {
    cleanEnv,
    npxCommand: resolveNpxPath(cleanEnv),
    directInvoke: resolveNpxDirect(cleanEnv) ?? undefined,
    extraArgs,
  };
}

/**
 * Spawn a generic ACP backend with clean env and Node version check.
 * Many generic backends are Node.js CLIs (#!/usr/bin/env node) that break
 * when Electron's inherited env resolves to an old Node version.
 * Safe for native binaries too — they ignore NODE_OPTIONS and Node version checks.
 */
export async function spawnGenericBackend(
  backend: string,
  cliPath: string,
  workingDir: string,
  acpArgs?: string[],
  customEnv?: Record<string, string>
): Promise<SpawnResult> {
  try {
    await fs.mkdir(workingDir, { recursive: true });
  } catch {
    // best-effort: if mkdir fails, let spawn report the actual error
  }

  const cleanEnv = await prepareCleanEnv();
  if (customEnv) {
    Object.assign(cleanEnv, customEnv);
  }
  ensureMinNodeVersion(cleanEnv, 18, 17, `${backend} ACP`);

  const spawnStart = Date.now();
  const detached = process.platform !== 'win32';
  const config = createGenericSpawnConfig(cliPath, workingDir, acpArgs, undefined, cleanEnv as Record<string, string>);
  const child = spawn(config.command, config.args, {
    ...config.options,
    detached,
  });
  if (detached) {
    child.unref();
  }
  if (ACP_PERF_LOG) console.log(`[ACP-PERF] connect: ${backend} process spawned ${Date.now() - spawnStart}ms`);

  return { child, isDetached: detached };
}

/** Callbacks for wiring a spawned child into the AcpConnection instance. */
export type NpxConnectHooks = {
  /** Wire the spawned child into the connection (e.g. attach protocol handlers). */
  setup: (result: SpawnResult) => Promise<void>;
  /** Terminate a failed Phase-1 child before retrying. */
  cleanup: () => Promise<void>;
};

/**
 * Connect to an npx-based ACP backend with Phase 1/2 retry strategy.
 * Phase 1: --prefer-offline for fast startup (~1-2s).
 * Phase 2: fresh registry lookup on failure (~3-5s).
 */
async function connectNpxBackend(config: {
  backend: string;
  npxPackage: string;
  prepareFn: () => NpxPrepareResult | Promise<NpxPrepareResult>;
  workingDir: string;
  /** Wire the spawned child into the connection (e.g. attach protocol handlers). */
  setup: (result: SpawnResult) => Promise<void>;
  /** Terminate a failed Phase-1 child before retrying. */
  cleanup: () => Promise<void>;
  extraArgs?: string[];
  detached?: boolean;
}): Promise<void> {
  const { backend, npxPackage, prepareFn, workingDir, setup, cleanup } = config;

  const envStart = Date.now();
  const { cleanEnv, npxCommand, directInvoke, extraArgs: prepExtraArgs = [] } = await prepareFn();
  if (ACP_PERF_LOG) console.log(`[ACP-PERF] ${backend}: env prepared ${Date.now() - envStart}ms`);

  const isWindows = process.platform === 'win32';
  const opts = {
    extraArgs: [...(config.extraArgs ?? []), ...prepExtraArgs],
    detached: config.detached ?? false,
    directInvoke,
  };

  // Phase 1: Try with --prefer-offline for fast startup
  try {
    await setup(spawnNpxBackend(backend, npxPackage, npxCommand, cleanEnv, workingDir, isWindows, true, opts));
  } catch (firstError) {
    // Phase 2: Retry without --prefer-offline to refresh stale cache
    console.warn(
      `[ACP] ${backend} --prefer-offline failed, retrying with fresh registry lookup:`,
      firstError instanceof Error ? firstError.message : String(firstError)
    );

    await cleanup();

    await setup(spawnNpxBackend(backend, npxPackage, npxCommand, cleanEnv, workingDir, isWindows, false, opts));
  }
}

// ── Exported per-backend connect functions ───────────────────────────

/** Connect to Claude ACP bridge via npx. */
export function connectClaude(workingDir: string, hooks: NpxConnectHooks): Promise<void> {
  return connectNpxBackend({
    backend: 'claude',
    npxPackage: CLAUDE_ACP_NPX_PACKAGE,
    prepareFn: prepareClaude,
    workingDir,
    ...hooks,
    detached: process.platform !== 'win32',
  });
}

/** Connect to Codex ACP bridge via npx. */
export function connectCodex(workingDir: string, hooks: NpxConnectHooks): Promise<void> {
  return (async () => {
    const cachedBinary = await resolveCachedCodexAcpBinary();
    if (cachedBinary) {
      try {
        const { cleanEnv } = await prepareCodex(cachedBinary.packageSpecifier);
        const config = createGenericSpawnConfig(
          cachedBinary.binaryPath,
          workingDir,
          [],
          undefined,
          cleanEnv as Record<string, string>
        );
        const child = spawn(config.command, config.args, config.options);
        await hooks.setup({ child, isDetached: false });
        return;
      } catch (error) {
        await hooks.cleanup();
        mainWarn(
          '[ACP codex]',
          `Cached platform binary failed, falling back to package resolution: ${cachedBinary.packageSpecifier}`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    const codexPlatformPackage = resolvePreferredCodexAcpPlatformPackage();
    const preferDirectPackage = codexPlatformPackage !== null && shouldPreferDirectCodexAcpPackage();
    const codexPackageCandidates = preferDirectPackage
      ? [codexPlatformPackage, CODEX_ACP_NPX_PACKAGE]
      : [CODEX_ACP_NPX_PACKAGE, ...(codexPlatformPackage ? [codexPlatformPackage] : [])];

    let lastError: Error | null = null;

    for (const [index, npxPackage] of codexPackageCandidates.entries()) {
      try {
        await connectNpxBackend({
          backend: 'codex',
          npxPackage,
          prepareFn: () => prepareCodex(npxPackage),
          workingDir,
          ...hooks,
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const fallbackPackageName = extractCodexPlatformPackageFromError(lastError.message);
        const fallbackPackage = fallbackPackageName
          ? resolveCodexAcpPlatformPackageSpecifier(fallbackPackageName)
          : null;
        const canRetryWithPlatformPackage =
          index === 0 &&
          !preferDirectPackage &&
          codexPlatformPackage !== null &&
          npxPackage === CODEX_ACP_NPX_PACKAGE &&
          isCodexMetaPackageOptionalDependencyError(lastError.message);
        const hasRemainingCandidates = index < codexPackageCandidates.length - 1;

        await hooks.cleanup();

        if (canRetryWithPlatformPackage) {
          if (fallbackPackage && !codexPackageCandidates.includes(fallbackPackage)) {
            codexPackageCandidates.push(fallbackPackage);
          }

          mainWarn(
            '[ACP codex]',
            `Meta bridge package failed to install its platform binary, retrying with direct package: ${codexPlatformPackage}`,
            lastError.message
          );
          continue;
        }

        if (hasRemainingCandidates) {
          mainWarn(
            '[ACP codex]',
            `Bridge package failed, retrying alternate package: ${npxPackage}`,
            lastError.message
          );
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error('Failed to start codex ACP bridge');
  })();
}

/** Connect to CodeBuddy ACP via npx. */
export function connectCodebuddy(workingDir: string, hooks: NpxConnectHooks): Promise<void> {
  return connectNpxBackend({
    backend: 'codebuddy',
    npxPackage: CODEBUDDY_ACP_NPX_PACKAGE,
    prepareFn: prepareCodebuddy,
    workingDir,
    ...hooks,
    extraArgs: ['--acp'],
    detached: process.platform !== 'win32',
  });
}
