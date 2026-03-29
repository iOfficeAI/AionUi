/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (vi.hoisted so factories can reference them) ---

const { openFileProvider, showItemInFolderProvider, openExternalProvider, shellMock } = vi.hoisted(() => ({
  openFileProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  showItemInFolderProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  openExternalProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  shellMock: {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
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
    },
  },
}));

vi.mock('electron', () => ({
  shell: shellMock,
}));

// --- Tests ---

let initShellBridge: typeof import('../../src/process/bridge/shellBridge').initShellBridge;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  openFileProvider.fn = undefined;
  showItemInFolderProvider.fn = undefined;
  openExternalProvider.fn = undefined;

  const mod = await import('../../src/process/bridge/shellBridge');
  initShellBridge = mod.initShellBridge;
});

describe('shellBridge', () => {
  describe('initShellBridge', () => {
    it('registers all three shell providers', () => {
      initShellBridge();
      expect(openFileProvider.fn).toBeDefined();
      expect(showItemInFolderProvider.fn).toBeDefined();
      expect(openExternalProvider.fn).toBeDefined();
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
  });
});
