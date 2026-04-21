/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { isBunxCacheCorruption, clearBunxCache, isBunCacheMoveFailed } from '../../src/process/agent/acp/acpConnectors';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    rmSync: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { rmSync } = await import('fs');
const rmSyncMock = vi.mocked(rmSync);

afterEach(() => {
  vi.clearAllMocks();
});

describe('isBunxCacheCorruption', () => {
  it('detects "Cannot find package" (Unix bun error)', () => {
    const stderr =
      "error: Cannot find package 'zod' from '/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0/node_modules/@agentclientprotocol/sdk/dist/acp.js'";
    expect(isBunxCacheCorruption(stderr)).toBe(true);
  });

  it('detects "Cannot find module" (Windows bun error)', () => {
    const stderr =
      "error: Cannot find module '@anthropic-ai/claude-agent-sdk' from 'C:\\Users\\test\\AppData\\Local\\Temp\\bunx-1743022513-@zed-industries\\claude-agent-acp@0.21.0\\node_modules\\@zed-industries\\claude-agent-acp\\dist\\acp-agent.js'";
    expect(isBunxCacheCorruption(stderr)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isBunxCacheCorruption('ENOENT: no such file or directory')).toBe(false);
    expect(isBunxCacheCorruption('Error: error loading config')).toBe(false);
    expect(isBunxCacheCorruption('command not found')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isBunxCacheCorruption('')).toBe(false);
  });
});

describe('clearBunxCache', () => {
  it('extracts and removes Unix bunx cache directory', () => {
    const stderr =
      "error: Cannot find package 'zod' from '/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0/node_modules/@agentclientprotocol/sdk/dist/acp.js'";

    const result = clearBunxCache(stderr);

    expect(result).toBe('/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0');
    expect(rmSyncMock).toHaveBeenCalledWith('/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0', {
      recursive: true,
      force: true,
    });
  });

  it('extracts and removes macOS bunx cache directory', () => {
    const stderr =
      "error: Cannot find package 'zod' from '/private/var/folders/t2/fy1kjb5d3711k89q19x2v05w0000gn/T/bunx-501-@zed-industries/claude-agent-acp@0.21.0/node_modules/@agentclientprotocol/sdk/dist/acp.js'";

    const result = clearBunxCache(stderr);

    expect(result).toBe(
      '/private/var/folders/t2/fy1kjb5d3711k89q19x2v05w0000gn/T/bunx-501-@zed-industries/claude-agent-acp@0.21.0'
    );
    expect(rmSyncMock).toHaveBeenCalledOnce();
  });

  it('extracts and removes Windows bunx cache directory', () => {
    const stderr =
      "error: Cannot find module '@anthropic-ai/claude-agent-sdk' from 'C:\\Users\\test\\AppData\\Local\\Temp\\bunx-1743022513-@zed-industries\\claude-agent-acp@0.21.0\\node_modules\\@zed-industries\\claude-agent-acp\\dist\\acp-agent.js'";

    const result = clearBunxCache(stderr);

    expect(result).toBe(
      'C:\\Users\\test\\AppData\\Local\\Temp\\bunx-1743022513-@zed-industries\\claude-agent-acp@0.21.0'
    );
    expect(rmSyncMock).toHaveBeenCalledOnce();
  });

  it('returns null when stderr does not contain a bunx cache path', () => {
    const stderr = 'Error: some other error without bunx path';

    const result = clearBunxCache(stderr);

    expect(result).toBeNull();
    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it('returns null when rmSync throws (permission denied, etc.)', () => {
    rmSyncMock.mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });

    const stderr =
      "error: Cannot find package 'zod' from '/tmp/bunx-501-@zed-industries/claude-agent-acp@0.21.0/node_modules/foo'";

    const result = clearBunxCache(stderr);

    expect(result).toBeNull();
    expect(rmSyncMock).toHaveBeenCalledOnce();
  });
});

describe('isBunCacheMoveFailed', () => {
  it('detects EPERM moving to cache dir error', () => {
    const stderr =
      'error: moving "@zed-industries/codex-acp-win32-x64" to cache dir failed\n' +
      'EPERM: Operation not permitted (NtSetInformationFile())\n' +
      '  From: .bdbfbff4faf5dd89-00000013\n';
    expect(isBunCacheMoveFailed(stderr)).toBe(true);
  });

  it('detects EPERM with different package names', () => {
    const stderr =
      'error: moving "@zed-industries/codex-acp" to cache dir failed\nEPERM: Operation not permitted (NtSetInformationFile())';
    expect(isBunCacheMoveFailed(stderr)).toBe(true);
  });

  it('returns false for unrelated EPERM errors', () => {
    expect(isBunCacheMoveFailed('EPERM: operation not permitted, unlink /some/file')).toBe(false);
  });

  it('returns false for non-EPERM cache errors', () => {
    expect(isBunCacheMoveFailed('error: moving package to cache dir failed\nENOENT: no such file')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isBunCacheMoveFailed('')).toBe(false);
  });

  it('returns false for unrelated errors', () => {
    expect(isBunCacheMoveFailed('Cannot find package zod')).toBe(false);
    expect(isBunCacheMoveFailed('command not found')).toBe(false);
  });
});
