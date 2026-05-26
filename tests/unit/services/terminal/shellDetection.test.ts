/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/services/terminal/shellDetection.
 * Covers POSIX/Windows fallback chains, env overrides, and TERM defaults.
 */

import { describe, expect, it } from 'vitest';

import { buildShellEnv, detectDefaultCwd, detectDefaultShell } from '@/process/services/terminal/shellDetection';

const noExists = () => false;
const allExists = () => true;

describe('detectDefaultShell — POSIX', () => {
  it('honors $SHELL when the file exists', () => {
    const shell = detectDefaultShell({
      platform: 'darwin',
      env: { SHELL: '/usr/local/bin/fish' },
      exists: (p) => p === '/usr/local/bin/fish',
    });
    expect(shell).toBe('/usr/local/bin/fish');
  });

  it('ignores $SHELL when the binary is missing', () => {
    const shell = detectDefaultShell({
      platform: 'linux',
      env: { SHELL: '/opt/missing/shell' },
      exists: (p) => p === '/bin/bash',
    });
    expect(shell).toBe('/bin/bash');
  });

  it('prefers /bin/zsh over /bin/bash when both exist', () => {
    const shell = detectDefaultShell({
      platform: 'darwin',
      env: {},
      exists: (p) => p === '/bin/zsh' || p === '/bin/bash',
    });
    expect(shell).toBe('/bin/zsh');
  });

  it('falls back to /bin/sh when nothing else is found', () => {
    const shell = detectDefaultShell({
      platform: 'linux',
      env: {},
      exists: noExists,
    });
    expect(shell).toBe('/bin/sh');
  });

  it('does not return zsh when only bash is present', () => {
    const shell = detectDefaultShell({
      platform: 'linux',
      env: {},
      exists: (p) => p === '/usr/bin/bash',
    });
    expect(shell).toBe('/usr/bin/bash');
  });
});

describe('detectDefaultShell — Windows', () => {
  it('honors $SHELL (Git Bash users)', () => {
    const shell = detectDefaultShell({
      platform: 'win32',
      env: { SHELL: 'C:\\Program Files\\Git\\bin\\bash.exe' },
      exists: allExists,
    });
    expect(shell).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
  });

  it('prefers PWSH_PATH when set', () => {
    const shell = detectDefaultShell({
      platform: 'win32',
      env: { PWSH_PATH: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' },
      exists: allExists,
    });
    expect(shell).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  });

  it('uses pwsh.exe when PSModulePath is present', () => {
    const shell = detectDefaultShell({
      platform: 'win32',
      env: { PSModulePath: 'C:\\Modules' },
      exists: allExists,
    });
    expect(shell).toBe('pwsh.exe');
  });

  it('falls back to ComSpec when no PowerShell signal is present', () => {
    const shell = detectDefaultShell({
      platform: 'win32',
      env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
      exists: allExists,
    });
    expect(shell).toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('falls back to cmd.exe when no env hints exist', () => {
    const shell = detectDefaultShell({
      platform: 'win32',
      env: {},
      exists: allExists,
    });
    expect(shell).toBe('cmd.exe');
  });
});

describe('detectDefaultCwd', () => {
  it('returns $HOME on POSIX', () => {
    expect(detectDefaultCwd({ HOME: '/home/user' })).toBe('/home/user');
  });

  it('returns $USERPROFILE when HOME is missing', () => {
    expect(detectDefaultCwd({ USERPROFILE: 'C:\\Users\\user' })).toBe('C:\\Users\\user');
  });

  it('falls back to process.cwd when no env hint exists and os.homedir is empty', () => {
    // detectDefaultCwd's last-resort branch hits os.homedir(); just verify it
    // returns *something* truthy for an empty env.
    const result = detectDefaultCwd({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('buildShellEnv', () => {
  it('sets TERM/COLORTERM/LANG when missing', () => {
    const env = buildShellEnv({ HOME: '/home/x' });
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.LANG).toBe('en_US.UTF-8');
    expect(env.HOME).toBe('/home/x');
  });

  it('preserves caller-provided TERM', () => {
    const env = buildShellEnv({ TERM: 'screen-256color' });
    expect(env.TERM).toBe('screen-256color');
  });

  it('drops non-string values', () => {
    const env = buildShellEnv({ HOME: '/h', SOMETHING: undefined as unknown as string });
    expect(env.HOME).toBe('/h');
    expect('SOMETHING' in env).toBe(false);
  });
});
