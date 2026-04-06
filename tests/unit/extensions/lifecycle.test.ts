/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

// Mock child_process.fork before importing lifecycle
const mockChildProcess = {
  send: vi.fn(),
  kill: vi.fn(),
  on: vi.fn(),
  emitter: new EventEmitter(),
};

vi.mock('child_process', () => ({
  fork: vi.fn(() => {
    // Wire .on() calls to the emitter so tests can trigger events
    mockChildProcess.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      mockChildProcess.emitter.on(event, handler);
      return mockChildProcess;
    });
    return {
      send: mockChildProcess.send,
      kill: mockChildProcess.kill,
      on: mockChildProcess.on,
    };
  }),
}));

import {
  activateExtension,
  deactivateExtension,
  uninstallExtension,
} from '../../../src/process/extensions/lifecycle/lifecycle';
import type { LoadedExtension } from '../../../src/process/extensions/types';

const tempRoots: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-test-'));
  tempRoots.push(dir);
  return dir;
}

function createExtension(dir: string, overrides?: Partial<LoadedExtension['manifest']>): LoadedExtension {
  return {
    directory: dir,
    manifest: {
      name: 'test-ext',
      displayName: 'Test Extension',
      version: '1.0.0',
      lifecycle: {
        onInstall: 'scripts/install.js',
        onActivate: 'scripts/activate.js',
        onDeactivate: 'scripts/deactivate.js',
        onUninstall: 'scripts/uninstall.js',
      },
      contributes: {},
      ...overrides,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function createHookScript(dir: string, relativePath: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, 'module.exports = function() {}', 'utf-8');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChildProcess.emitter.removeAllListeners();
});

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('extensions/lifecycle — fork-based execution', () => {
  describe('activateExtension', () => {
    it('should fork child process for onInstall when isFirstTime=true', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/install.js');
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      // Simulate successful response for both hooks
      mockChildProcess.send.mockImplementation(() => {
        // After send is called, immediately trigger success response
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      const promise = activateExtension(ext, true);
      await promise;

      // fork should be called twice (onInstall + onActivate)
      expect(fork).toHaveBeenCalledTimes(2);
    });

    it('should only fork for onActivate when isFirstTime=false', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(fork).toHaveBeenCalledTimes(1);
    });

    it('should not fork when no lifecycle hooks declared', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      const ext = createExtension(dir, { lifecycle: undefined });

      await activateExtension(ext, true);

      expect(fork).not.toHaveBeenCalled();
    });
  });

  describe('runLifecycleHook (via public API)', () => {
    it('should return gracefully when hook script does not exist', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      // Don't create the script file
      const ext = createExtension(dir);

      // Should not throw, just skip
      await expect(activateExtension(ext, false)).resolves.toBeUndefined();
      expect(fork).not.toHaveBeenCalled();
    });

    it('should return gracefully when hook script path escapes extension directory', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      const ext = createExtension(dir, {
        lifecycle: { onActivate: '../../../etc/passwd' },
      });

      await expect(activateExtension(ext, false)).resolves.toBeUndefined();
      expect(fork).not.toHaveBeenCalled();
    });

    it('should handle child process error event', async () => {
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('error', new Error('spawn failed')), 5);
      });

      // Should not throw, just return (hook failure is non-fatal)
      await expect(activateExtension(ext, false)).resolves.toBeUndefined();
    });

    it('should handle child process non-zero exit', async () => {
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('exit', 1), 5);
      });

      await expect(activateExtension(ext, false)).resolves.toBeUndefined();
    });

    it('should handle hook failure message from child', async () => {
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: false, error: 'hook threw' }), 5);
      });

      await expect(activateExtension(ext, false)).resolves.toBeUndefined();
    });

    it('should set cwd to extension directory when forking', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(fork).toHaveBeenCalledWith(expect.any(String), [], expect.objectContaining({ cwd: dir }));
    });

    it('should send correct payload to child process', async () => {
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(mockChildProcess.send).toHaveBeenCalledWith({
        type: 'script',
        scriptPath: path.resolve(dir, 'scripts/activate.js'),
        hookName: 'onActivate',
        context: {
          extensionName: 'test-ext',
          extensionDir: dir,
          version: '1.0.0',
        },
      });
    });
  });

  describe('deactivateExtension', () => {
    it('should fork for onDeactivate hook', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/deactivate.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await deactivateExtension(ext);

      expect(fork).toHaveBeenCalledTimes(1);
    });
  });

  describe('uninstallExtension', () => {
    it('should fork for onUninstall hook', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/uninstall.js');
      const ext = createExtension(dir);

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await uninstallExtension(ext);

      expect(fork).toHaveBeenCalledTimes(1);
    });
  });

  describe('object format hooks (custom timeout)', () => {
    it('should fork correctly with object format { script, timeout }', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir, {
        lifecycle: {
          onActivate: { script: 'scripts/activate.js', timeout: 10000 },
        },
      });

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(fork).toHaveBeenCalledTimes(1);
    });

    it('should send correct scriptPath from object format', async () => {
      const dir = createTempDir();
      createHookScript(dir, 'scripts/install.js');
      const ext = createExtension(dir, {
        lifecycle: {
          onActivate: { script: 'scripts/install.js', timeout: 5000 },
        },
      });

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(mockChildProcess.send).toHaveBeenCalledWith(
        expect.objectContaining({
          scriptPath: path.resolve(dir, 'scripts/install.js'),
          hookName: 'onActivate',
        })
      );
    });

    it('should work with object format without timeout (uses default)', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir, {
        lifecycle: {
          onActivate: { script: 'scripts/activate.js' },
        },
      });

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(fork).toHaveBeenCalledTimes(1);
    });

    it('should support mixed string and object format in same lifecycle', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      createHookScript(dir, 'scripts/install.js');
      createHookScript(dir, 'scripts/activate.js');
      const ext = createExtension(dir, {
        lifecycle: {
          onInstall: { script: 'scripts/install.js', timeout: 180000 },
          onActivate: 'scripts/activate.js',
        },
      });

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, true);

      // Both onInstall (object format) and onActivate (string format) should fork
      expect(fork).toHaveBeenCalledTimes(2);
    });

    it('should reject path traversal in object format', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      const ext = createExtension(dir, {
        lifecycle: {
          onActivate: { script: '../../../etc/passwd', timeout: 5000 },
        },
      });

      await activateExtension(ext, false);

      expect(fork).not.toHaveBeenCalled();
    });

    it('should spawn process for shell format via runner', async () => {
      const { fork } = await import('child_process');
      const dir = createTempDir();
      const ext = createExtension(dir, {
        lifecycle: {
          onActivate: { shell: { cliCommand: 'echo', args: ['hello'] } },
        },
      });

      mockChildProcess.send.mockImplementation(() => {
        setTimeout(() => mockChildProcess.emitter.emit('message', { success: true }), 5);
      });

      await activateExtension(ext, false);

      expect(fork).toHaveBeenCalledTimes(1);
      expect(mockChildProcess.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'shell',
          shell: { cliCommand: 'echo', args: ['hello'] },
        })
      );
    });
  });
});
