/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-platform default-shell resolution for the integrated terminal panel.
 *
 * Kept free of Electron and node-pty imports so it stays unit-testable.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export type ShellEnv = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** Optional override for filesystem existence checks (test injection). */
  exists?: (path: string) => boolean;
};

const POSIX_CANDIDATES: readonly string[] = ['/bin/zsh', '/usr/bin/zsh', '/bin/bash', '/usr/bin/bash', '/bin/sh'];

const WIN_FALLBACK_PWSH = 'pwsh.exe';
const WIN_FALLBACK_POWERSHELL = 'powershell.exe';
const WIN_FALLBACK_CMD = 'cmd.exe';

/**
 * Resolve the absolute path (or bare executable name on Windows) of the user's
 * preferred login shell. Throws only if no candidate could be found, which
 * should be unreachable on supported platforms.
 */
export function detectDefaultShell({ platform, env, exists = existsSync }: ShellEnv): string {
  if (platform === 'win32') {
    return resolveWindowsShell(env);
  }
  return resolvePosixShell(env, exists);
}

/**
 * Default working directory for a new session when none is supplied.
 * Falls back through workspace hints → HOME → process.cwd().
 */
export function detectDefaultCwd(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME || env.USERPROFILE || homedir();
  if (home) return home;
  return process.cwd();
}

function resolvePosixShell(env: NodeJS.ProcessEnv, exists: (path: string) => boolean): string {
  const fromEnv = env.SHELL?.trim();
  if (fromEnv && exists(fromEnv)) {
    return fromEnv;
  }
  for (const candidate of POSIX_CANDIDATES) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  // Final fallback — POSIX guarantees /bin/sh, even if existsSync stub says no.
  return '/bin/sh';
}

function resolveWindowsShell(env: NodeJS.ProcessEnv): string {
  // ComSpec is set on every Windows install and points at cmd.exe; SHELL may be
  // set by Git Bash users. We prefer pwsh > powershell > ComSpec > cmd.exe.
  const fromEnv = env.SHELL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const pwshPath = env.PWSH_PATH?.trim();
  if (pwshPath) {
    return pwshPath;
  }
  if (env.PSModulePath) {
    // Heuristic: presence of PSModulePath strongly implies pwsh/powershell are reachable on PATH.
    return WIN_FALLBACK_PWSH;
  }
  const comSpec = env.ComSpec?.trim();
  if (comSpec) {
    return comSpec;
  }
  return process.env.PWSH_PATH ? WIN_FALLBACK_PWSH : env.PSModulePath ? WIN_FALLBACK_POWERSHELL : WIN_FALLBACK_CMD;
}

/**
 * Sanitize spawn env so the PTY behaves like a real interactive shell.
 * Sets TERM/COLORTERM if missing; preserves caller-provided overrides.
 */
export function buildShellEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'string') out[k] = v;
  }
  if (!out.TERM) out.TERM = 'xterm-256color';
  if (!out.COLORTERM) out.COLORTERM = 'truecolor';
  // Some apps (e.g. less) inspect LANG; default to UTF-8 to avoid garbled glyphs.
  if (!out.LANG) out.LANG = 'en_US.UTF-8';
  return out;
}
