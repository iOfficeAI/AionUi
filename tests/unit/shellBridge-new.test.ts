/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Store registered providers so we can test them
const registeredProviders: Record<string, Function> = {};

// Mock electron
vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn().mockReturnValue({
    on: vi.fn(),
    unref: vi.fn(),
  }),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock @/common ipcBridge - capture the registered functions
vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openFile: {
        provider: vi.fn((fn: Function) => {
          registeredProviders['openFile'] = fn;
        }),
      },
      showItemInFolder: {
        provider: vi.fn((fn: Function) => {
          registeredProviders['showItemInFolder'] = fn;
        }),
      },
      openExternal: {
        provider: vi.fn((fn: Function) => {
          registeredProviders['openExternal'] = fn;
        }),
      },
      checkToolInstalled: {
        provider: vi.fn((fn: Function) => {
          registeredProviders['checkToolInstalled'] = fn;
        }),
      },
      openFolderWith: {
        provider: vi.fn((fn: Function) => {
          registeredProviders['openFolderWith'] = fn;
        }),
      },
    },
  },
}));

// Import the module being tested (this registers the providers)
import { initShellBridge } from '../../src/process/bridge/shellBridge';
import { shell } from 'electron';
import * as fs from 'fs';
import { exec, spawn } from 'child_process';

describe('shellBridge with actual providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear registered providers
    Object.keys(registeredProviders).forEach((key) => delete registeredProviders[key]);
    // Re-initialize to register providers
    initShellBridge();
  });

  describe('openFile provider', () => {
    it('calls shell.openPath with the given path', async () => {
      vi.mocked(shell.openPath).mockResolvedValue('');

      await registeredProviders['openFile']('/test/file.txt');

      expect(shell.openPath).toHaveBeenCalledWith('/test/file.txt');
    });

    it('logs warning when shell.openPath returns error', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(shell.openPath).mockResolvedValue('No application associated with this file type');

      await registeredProviders['openFile']('/test/unknown.xyz');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to open path'));
      warnSpy.mockRestore();
    });

    it('handles shell.openPath rejection gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('Failed to open');
      vi.mocked(shell.openPath).mockRejectedValue(error);

      await registeredProviders['openFile']('/test/file.txt');

      expect(warnSpy).toHaveBeenCalledWith('[shellBridge] Failed to open path:', 'Failed to open');
      warnSpy.mockRestore();
    });
  });

  describe('showItemInFolder provider', () => {
    it('calls shell.showItemInFolder with the path', async () => {
      await registeredProviders['showItemInFolder']('/test/folder');

      expect(shell.showItemInFolder).toHaveBeenCalledWith('/test/folder');
    });
  });

  describe('openExternal provider', () => {
    it('calls shell.openExternal for valid URL', async () => {
      await registeredProviders['openExternal']('https://example.com');

      expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('rejects invalid URLs without calling shell.openExternal', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await registeredProviders['openExternal']('not-a-valid-url');

      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
      warnSpy.mockRestore();
    });

    it('rejects empty string URLs', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await registeredProviders['openExternal']('');

      expect(shell.openExternal).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('checkToolInstalled provider', () => {
    it('returns true for terminal on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = await registeredProviders['checkToolInstalled']({ tool: 'terminal' });

      expect(result).toBe(true);
    });

    it('returns true for terminal on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = await registeredProviders['checkToolInstalled']({ tool: 'terminal' });

      expect(result).toBe(true);
    });

    it('returns true for terminal on Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = await registeredProviders['checkToolInstalled']({ tool: 'terminal' });

      expect(result).toBe(true);
    });

    it('returns true for explorer', async () => {
      const result = await registeredProviders['checkToolInstalled']({ tool: 'explorer' });

      expect(result).toBe(true);
    });

    it('returns false for unknown tool', async () => {
      const result = await registeredProviders['checkToolInstalled']({ tool: 'unknown-tool' });

      expect(result).toBe(false);
    });

    it('checks VS Code installation via file paths', async () => {
      // Mock fs.existsSync to return false for all paths, and exec to fail
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(exec).mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('not found'), { stdout: '', stderr: '' });
        return undefined as any;
      });

      const result = await registeredProviders['checkToolInstalled']({ tool: 'vscode' });

      // Should have checked file paths and command
      expect(fs.existsSync).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('openFolderWith provider', () => {
    it('opens folder with explorer on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.mocked(shell.openPath).mockResolvedValue('');

      await registeredProviders['openFolderWith']({ folderPath: 'C:\\Projects', tool: 'explorer' });

      expect(shell.openPath).toHaveBeenCalledWith('C:\\Projects');
    });

    it('opens folder with terminal on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await registeredProviders['openFolderWith']({ folderPath: '/workspace/project', tool: 'terminal' });

      expect(spawn).toHaveBeenCalledWith('open', ['-a', 'Terminal', '/workspace/project'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('opens folder with terminal on Windows using PowerShell', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      await registeredProviders['openFolderWith']({ folderPath: 'C:\\Projects', tool: 'terminal' });

      expect(spawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'start', 'powershell.exe', '-NoExit', '-Command', expect.stringContaining('Set-Location')],
        {
          detached: true,
          windowsHide: false,
        }
      );
    });

    it('opens folder with explorer on macOS using open command', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await registeredProviders['openFolderWith']({ folderPath: '/projects', tool: 'explorer' });

      expect(spawn).toHaveBeenCalledWith('open', ['/projects'], { detached: true, stdio: 'ignore' });
    });

    it('handles Linux with xdg-open', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(shell.openPath).mockResolvedValue('');

      await registeredProviders['openFolderWith']({ folderPath: '/projects', tool: 'explorer' });

      expect(spawn).toHaveBeenCalledWith('xdg-open', ['/projects'], { detached: true, stdio: 'ignore' });
    });

    it('handles Linux terminal by trying common emulators', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      // Mock commandExists to find gnome-terminal
      vi.mocked(exec).mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes('gnome-terminal')) {
          callback(null, { stdout: '/usr/bin/gnome-terminal', stderr: '' });
        } else {
          callback(new Error('not found'), { stdout: '', stderr: '' });
        }
        return undefined as any;
      });

      await registeredProviders['openFolderWith']({ folderPath: '/project', tool: 'terminal' });

      expect(spawn).toHaveBeenCalledWith('gnome-terminal', ['--working-directory=/project'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('falls back to xdg-open on Linux when no terminal found', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      // Mock commandExists to not find any terminal
      vi.mocked(exec).mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('not found'), { stdout: '', stderr: '' });
        return undefined as any;
      });

      await registeredProviders['openFolderWith']({ folderPath: '/project', tool: 'terminal' });

      expect(shell.openPath).toHaveBeenCalledWith('/project');
    });

    it('finds VS Code on macOS in Applications folder', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      // Mock spawn to fire error event synchronously for the 'code' command,
      // then return a normal mock for the fallback spawn call
      vi.mocked(spawn)
        .mockReturnValueOnce({
          on: vi.fn().mockImplementation((event: string, cb: Function) => {
            if (event === 'error') cb(new Error('spawn ENOENT'));
          }),
          unref: vi.fn(),
        } as any)
        .mockReturnValue({ on: vi.fn(), unref: vi.fn() } as any);
      // Mock fs.existsSync to find VS Code in macOS path
      vi.mocked(fs.existsSync).mockImplementation((filepath: string) => {
        return filepath === '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
      });

      await registeredProviders['openFolderWith']({ folderPath: '/project', tool: 'vscode' });
      // Flush microtasks so the async error handler completes
      await new Promise((resolve) => setTimeout(resolve));

      expect(fs.existsSync).toHaveBeenCalledWith(
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
      );
      expect(spawn).toHaveBeenCalled();
    });

    it('finds VS Code on Linux in common paths', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      // Mock spawn to fire error event synchronously for the 'code' command,
      // then return a normal mock for the fallback spawn call
      vi.mocked(spawn)
        .mockReturnValueOnce({
          on: vi.fn().mockImplementation((event: string, cb: Function) => {
            if (event === 'error') cb(new Error('spawn ENOENT'));
          }),
          unref: vi.fn(),
        } as any)
        .mockReturnValue({ on: vi.fn(), unref: vi.fn() } as any);
      // Mock fs.existsSync to find VS Code in Linux path
      vi.mocked(fs.existsSync).mockImplementation((filepath: string) => {
        return filepath === '/usr/bin/code';
      });

      await registeredProviders['openFolderWith']({ folderPath: '/project', tool: 'vscode' });
      // Flush microtasks so the async error handler completes
      await new Promise((resolve) => setTimeout(resolve));

      expect(fs.existsSync).toHaveBeenCalledWith('/usr/bin/code');
      expect(spawn).toHaveBeenCalled();
    });
  });
});
