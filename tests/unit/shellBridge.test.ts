/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (vi.hoisted so factories can reference them) ---

const {
  openFileProvider,
  showItemInFolderProvider,
  openExternalProvider,
  checkToolInstalledProvider,
  openFolderWithProvider,
  shellMock,
  execMock,
  spawnMock,
  fsMock,
} = vi.hoisted(() => ({
  openFileProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  showItemInFolderProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  openExternalProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  checkToolInstalledProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  openFolderWithProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  shellMock: {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  execMock: vi.fn(),
  spawnMock: vi.fn().mockReturnValue({
    on: vi.fn(),
    unref: vi.fn(),
  }),
  fsMock: {
    existsSync: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openFile: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          openFileProvider.fn = fn;
        }),
      },
      showItemInFolder: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          showItemInFolderProvider.fn = fn;
        }),
      },
      openExternal: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          openExternalProvider.fn = fn;
        }),
      },
      checkToolInstalled: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          checkToolInstalledProvider.fn = fn;
        }),
      },
      openFolderWith: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          openFolderWithProvider.fn = fn;
        }),
      },
    },
  },
}));

vi.mock('electron', () => ({
  shell: shellMock,
}));

vi.mock('child_process', () => ({
  exec: execMock,
  spawn: spawnMock,
}));

vi.mock('fs', () => ({
  existsSync: fsMock.existsSync,
}));

// --- Tests ---

let initShellBridge: typeof import('../../src/process/bridge/shellBridge').initShellBridge;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  openFileProvider.fn = undefined;
  showItemInFolderProvider.fn = undefined;
  openExternalProvider.fn = undefined;
  checkToolInstalledProvider.fn = undefined;
  openFolderWithProvider.fn = undefined;

  // Default mocks
  Object.defineProperty(process, 'platform', { value: 'win32' });

  const mod = await import('../../src/process/bridge/shellBridge');
  initShellBridge = mod.initShellBridge;
});

describe('shellBridge', () => {
  describe('initShellBridge', () => {
    it('registers all five shell providers', () => {
      initShellBridge();
      expect(openFileProvider.fn).toBeDefined();
      expect(showItemInFolderProvider.fn).toBeDefined();
      expect(openExternalProvider.fn).toBeDefined();
      expect(checkToolInstalledProvider.fn).toBeDefined();
      expect(openFolderWithProvider.fn).toBeDefined();
    });
  });

  describe('openFile — error handling', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('calls shell.openPath with the given path', async () => {
      shellMock.openPath.mockResolvedValue('');
      await openFileProvider.fn!('/some/file.txt');
      expect(shellMock.openPath).toHaveBeenCalledWith('/some/file.txt');
    });

    it('logs warning when shell.openPath returns an error string', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shellMock.openPath.mockResolvedValue('No application associated with this file type');
      await openFileProvider.fn!('/some/file.xyz');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to open path'));
      warnSpy.mockRestore();
    });

    it('does not throw when shell.openPath rejects', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shellMock.openPath.mockRejectedValue(new Error('Failed to open: 没有应用程序与此操作的指定文件有关联。 (0x483)'));
      await expect(openFileProvider.fn!('/some/file.xyz')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open path'),
        expect.stringContaining('没有应用程序')
      );
      warnSpy.mockRestore();
    });
  });

  describe('openExternal — URL validation', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('calls shell.openExternal for valid URLs', async () => {
      await openExternalProvider.fn!('https://example.com');
      expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('rejects invalid URLs without calling shell.openExternal', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await openExternalProvider.fn!('not-a-valid-url');
      expect(shellMock.openExternal).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
      warnSpy.mockRestore();
    });

    it('rejects empty string URLs without calling shell.openExternal', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await openExternalProvider.fn!('');
      expect(shellMock.openExternal).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does not throw when shell.openExternal rejects (ELECTRON-HW)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shellMock.openExternal.mockRejectedValueOnce(new Error('Failed to open: 系统找不到指定的文件。 (0x2)'));
      await expect(openExternalProvider.fn!('https://example.com/missing')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open external URL'),
        expect.stringContaining('系统找不到指定的文件')
      );
      warnSpy.mockRestore();
    });
  });

  describe('checkToolInstalled', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('returns true for terminal on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const result = await checkToolInstalledProvider.fn!({ tool: 'terminal' });
      expect(result).toBe(true);
    });

    it('returns true for terminal on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const result = await checkToolInstalledProvider.fn!({ tool: 'terminal' });
      expect(result).toBe(true);
    });

    it('returns true for terminal on Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const result = await checkToolInstalledProvider.fn!({ tool: 'terminal' });
      expect(result).toBe(true);
    });

    it('returns true for explorer', async () => {
      const result = await checkToolInstalledProvider.fn!({ tool: 'explorer' });
      expect(result).toBe(true);
    });

    it('returns false for unknown tool', async () => {
      const result = await checkToolInstalledProvider.fn!({ tool: 'unknown-tool' as any });
      expect(result).toBe(false);
    });
  });

  describe('openFolderWith', () => {
    beforeEach(() => {
      initShellBridge();
      execMock.mockImplementation((cmd: string, callback: (err: Error | null) => void) => {
        callback(null);
      });
    });

    it('opens folder with explorer on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      shellMock.openPath.mockResolvedValue('');

      await openFolderWithProvider.fn!({ folderPath: 'C:\\Projects', tool: 'explorer' });

      expect(shellMock.openPath).toHaveBeenCalledWith('C:\\Projects');
    });

    it('opens folder with terminal on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await openFolderWithProvider.fn!({ folderPath: '/workspace/project', tool: 'terminal' });

      expect(spawnMock).toHaveBeenCalledWith('open', ['-a', 'Terminal', '/workspace/project'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('handles folder path with special characters', async () => {
      const folderWithSpecialChars = "/path/with'quotes";
      shellMock.openPath.mockResolvedValue('');

      await openFolderWithProvider.fn!({ folderPath: folderWithSpecialChars, tool: 'explorer' });

      expect(shellMock.openPath).toHaveBeenCalledWith(folderWithSpecialChars);
    });

    it('uses shell:true for .cmd fallback on Windows and handles EINVAL', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Set Windows env vars so findVSCodeExecutable builds the right paths
      const origProgramFiles = process.env['ProgramFiles'];
      process.env['ProgramFiles'] = 'C:\\Program Files';

      // First spawn of 'code' fails with ENOENT
      let errorCallback: ((...args: unknown[]) => void) | undefined;
      const firstChild = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') errorCallback = cb;
        }),
        unref: vi.fn(),
      };

      // Fallback spawn of 'code.cmd' also emits error (EINVAL)
      let fallbackErrorCallback: ((...args: unknown[]) => void) | undefined;
      const fallbackChild = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') fallbackErrorCallback = cb;
        }),
        unref: vi.fn(),
      };

      spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(fallbackChild);

      // findVSCodeExecutable finds code.cmd via ProgramFiles
      fsMock.existsSync.mockImplementation((p: string) => p.endsWith('code.cmd') && p.includes('Program Files'));

      await openFolderWithProvider.fn!({ folderPath: 'C:\\Projects\\Q&M', tool: 'vscode' });

      // Trigger ENOENT on first spawn
      expect(errorCallback).toBeDefined();
      await errorCallback!(new Error('spawn code ENOENT'));

      // Fallback spawn should use shell: true for .cmd
      const fallbackCall = spawnMock.mock.calls[1];
      expect(fallbackCall).toBeDefined();
      expect(fallbackCall[0]).toContain('code.cmd');
      expect(fallbackCall[2]).toMatchObject({ shell: true });

      // Trigger EINVAL on fallback — should not throw, falls back to shell.openPath
      expect(fallbackErrorCallback).toBeDefined();
      shellMock.openPath.mockResolvedValue('');
      fallbackErrorCallback!(new Error('spawn EINVAL'));
      expect(shellMock.openPath).toHaveBeenCalledWith('C:\\Projects\\Q&M');

      // Restore env
      if (origProgramFiles === undefined) {
        delete process.env['ProgramFiles'];
      } else {
        process.env['ProgramFiles'] = origProgramFiles;
      }
    });
  });
});
