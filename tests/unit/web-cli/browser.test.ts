/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildOpenBrowserCommand,
  openBrowserUrl,
  shouldAutoOpenBrowser,
} from '../../../packages/web-cli/src/browser.js';

describe('shouldAutoOpenBrowser', () => {
  it('defaults to opening the browser for local-only launches', () => {
    expect(shouldAutoOpenBrowser({ allowRemote: false })).toBe(true);
  });

  it('skips auto-open by default for remote launches', () => {
    expect(shouldAutoOpenBrowser({ allowRemote: true })).toBe(false);
  });

  it('allows explicit --open to override remote mode', () => {
    expect(
      shouldAutoOpenBrowser({
        allowRemote: true,
        openFlag: true,
      })
    ).toBe(true);
  });

  it('lets --no-open win even when the env var requests auto-open', () => {
    expect(
      shouldAutoOpenBrowser({
        allowRemote: false,
        noOpenFlag: true,
        env: { AIONUI_OPEN_BROWSER: 'true' },
      })
    ).toBe(false);
  });

  it('honors AIONUI_OPEN_BROWSER=false for local launches', () => {
    expect(
      shouldAutoOpenBrowser({
        allowRemote: false,
        env: { AIONUI_OPEN_BROWSER: 'false' },
      })
    ).toBe(false);
  });
});

describe('buildOpenBrowserCommand', () => {
  it('uses open on macOS', () => {
    expect(buildOpenBrowserCommand('http://127.0.0.1:25808', 'darwin')).toEqual({
      command: 'open',
      args: ['http://127.0.0.1:25808'],
    });
  });

  it('uses cmd /c start on Windows', () => {
    expect(buildOpenBrowserCommand('http://127.0.0.1:25808', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'http://127.0.0.1:25808'],
      windowsHide: true,
    });
  });
});

describe('openBrowserUrl', () => {
  it('spawns the platform opener for supported platforms', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0 });

    const result = openBrowserUrl('http://127.0.0.1:25808', {
      platform: 'linux',
      spawnSync,
    });

    expect(result).toEqual({ ok: true });
    expect(spawnSync).toHaveBeenCalledWith('xdg-open', ['http://127.0.0.1:25808'], {
      stdio: 'ignore',
      windowsHide: false,
    });
  });

  it('returns a failure result when the opener command cannot be started', () => {
    const spawnSync = vi.fn().mockReturnValue({
      status: null,
      error: new Error('spawn xdg-open ENOENT'),
    });

    const result = openBrowserUrl('http://127.0.0.1:25808', {
      platform: 'linux',
      spawnSync,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('ENOENT');
    }
  });

  it('returns a failure result for unsupported platforms', () => {
    const spawnSync = vi.fn();

    const result = openBrowserUrl('http://127.0.0.1:25808', {
      platform: 'haiku',
      spawnSync,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported platform: haiku',
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
