/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/process/utils/safeExec.ts
 *
 * Verifies:
 * 1. safeExec uses the correct shell per platform (sh vs cmd.exe)
 * 2. safeExecFile uses detached correctly per platform
 * 3. Windows-specific behavior: detached=false, windowsHide=true
 *
 * All tests mock child_process.spawn to verify arguments without
 * actually spawning processes, so they run on any OS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Helpers: fake ChildProcess created lazily inside spawn mock
// ---------------------------------------------------------------------------

function createFakeChild(exitCode: number = 0) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdin: null;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  child.pid = 12345;
  child.stdin = null;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn();
  child.unref = vi.fn();

  // Emit close AFTER caller has attached listeners (setImmediate runs
  // after the current tick completes, which means after spawn's caller
  // has set up .on('close', ...) handlers).
  setImmediate(() => {
    child.emit('close', exitCode);
  });

  return child;
}

/**
 * Create a mockSpawn that captures the call args and returns a fake child.
 */
function createMockSpawn(exitCode = 0) {
  const fakeChild = { ref: null as ReturnType<typeof createFakeChild> | null };
  const mockSpawn = vi.fn().mockImplementation(() => {
    fakeChild.ref = createFakeChild(exitCode);
    return fakeChild.ref;
  });
  return { mockSpawn, getFakeChild: () => fakeChild.ref! };
}

// ---------------------------------------------------------------------------
// 1. safeExec — shell selection per platform
// ---------------------------------------------------------------------------
describe('safeExec', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses sh -c on POSIX (macOS/Linux)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const { mockSpawn, getFakeChild } = createMockSpawn(0);

    vi.doMock('child_process', () => ({
      spawn: mockSpawn,
      execFile: vi.fn(),
    }));

    const { safeExec } = await import('@process/utils/safeExec');
    await safeExec('echo hello');

    expect(mockSpawn).toHaveBeenCalledWith('sh', ['-c', 'echo hello'], expect.objectContaining({ detached: true }));
    expect(getFakeChild().unref).toHaveBeenCalled();
  });

  it('uses cmd.exe /c on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { mockSpawn, getFakeChild } = createMockSpawn(0);

    vi.doMock('child_process', () => ({
      spawn: mockSpawn,
      execFile: vi.fn(),
    }));

    const { safeExec } = await import('@process/utils/safeExec');
    await safeExec('echo hello');

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('cmd'),
      ['/c', 'echo hello'],
      expect.objectContaining({
        detached: false,
        windowsHide: true,
      })
    );
    expect(getFakeChild().unref).not.toHaveBeenCalled();
  });

  it('rejects on non-zero exit code', async () => {
    const { mockSpawn } = createMockSpawn(1);

    vi.doMock('child_process', () => ({
      spawn: mockSpawn,
      execFile: vi.fn(),
    }));

    const { safeExec } = await import('@process/utils/safeExec');
    await expect(safeExec('failing-cmd')).rejects.toThrow('Command failed with exit code 1');
  });
});

// ---------------------------------------------------------------------------
// 2. safeExecFile — detached flag per platform
// ---------------------------------------------------------------------------
describe('safeExecFile', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('spawns with detached: false and windowsHide on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { mockSpawn, getFakeChild } = createMockSpawn(0);

    vi.doMock('child_process', () => ({
      spawn: mockSpawn,
      execFile: vi.fn(),
    }));

    const { safeExecFile } = await import('@process/utils/safeExec');
    await safeExecFile('node', ['--version']);

    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      ['--version'],
      expect.objectContaining({
        detached: false,
        windowsHide: true,
      })
    );
    expect(getFakeChild().unref).not.toHaveBeenCalled();
  });

  it('spawns with detached: true on POSIX', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const { mockSpawn, getFakeChild } = createMockSpawn(0);

    vi.doMock('child_process', () => ({
      spawn: mockSpawn,
      execFile: vi.fn(),
    }));

    const { safeExecFile } = await import('@process/utils/safeExec');
    await safeExecFile('node', ['--version']);

    expect(mockSpawn).toHaveBeenCalledWith('node', ['--version'], expect.objectContaining({ detached: true }));
    expect(getFakeChild().unref).toHaveBeenCalled();
  });
});
