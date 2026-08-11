/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (vi.hoisted so factories can reference them) ---

const { openFileProvider, showItemInFolderProvider, openExternalProvider, execFileMock } = vi.hoisted(() => ({
  openFileProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  showItemInFolderProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  openExternalProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  execFileMock: vi.fn(),
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

vi.mock('node:child_process', () => ({
  execFile: (...args: any[]) => execFileMock(...args),
}));

// --- Tests ---

let initShellBridgeStandalone: typeof import('../../src/process/bridge/shellBridgeStandalone').initShellBridgeStandalone;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  openFileProvider.fn = undefined;
  showItemInFolderProvider.fn = undefined;
  openExternalProvider.fn = undefined;

  const mod = await import('../../src/process/bridge/shellBridgeStandalone');
  initShellBridgeStandalone = mod.initShellBridgeStandalone;
});

describe('shellBridgeStandalone', () => {
  describe('initShellBridgeStandalone', () => {
    it('registers all three shell providers', () => {
      initShellBridgeStandalone();
      expect(openFileProvider.fn).toBeDefined();
      expect(showItemInFolderProvider.fn).toBeDefined();
      expect(openExternalProvider.fn).toBeDefined();
    });
  });

  describe('runOpen — darwin platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (err: null) => void) => cb(null));
      initShellBridgeStandalone();
    });

    it('openFile calls open with the file path', async () => {
      await openFileProvider.fn!('/path/to/file.pdf');
      expect(execFileMock).toHaveBeenCalledWith('open', ['/path/to/file.pdf'], expect.any(Function));
    });

    it('showItemInFolder calls open with the parent directory', async () => {
      await showItemInFolderProvider.fn!('/path/to/file.pdf');
      expect(execFileMock).toHaveBeenCalledWith('open', ['/path/to'], expect.any(Function));
    });

    it('openExternal calls open with the URL', async () => {
      await openExternalProvider.fn!('https://example.com');
      expect(execFileMock).toHaveBeenCalledWith('open', ['https://example.com'], expect.any(Function));
    });
  });

  describe('runOpen — win32 platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (err: null) => void) => cb(null));
      initShellBridgeStandalone();
    });

    it('openFile calls cmd /c start with the file path', async () => {
      await openFileProvider.fn!('C:\\path\\to\\file.pdf');
      expect(execFileMock).toHaveBeenCalledWith(
        'cmd',
        ['/c', 'start', '', 'C:\\path\\to\\file.pdf'],
        expect.any(Function)
      );
    });
  });

  describe('runOpen — linux platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (err: null) => void) => cb(null));
      initShellBridgeStandalone();
    });

    it('openFile calls xdg-open with the file path', async () => {
      await openFileProvider.fn!('/path/to/file.pdf');
      expect(execFileMock).toHaveBeenCalledWith('xdg-open', ['/path/to/file.pdf'], expect.any(Function));
    });
  });

  describe('openExternal — URL validation', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (err: null) => void) => cb(null));
      initShellBridgeStandalone();
    });

    it('rejects invalid URLs without calling execFile', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await openExternalProvider.fn!('not-a-valid-url');
      expect(execFileMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
      warnSpy.mockRestore();
    });

    it('rejects empty string URLs without calling execFile', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await openExternalProvider.fn!('');
      expect(execFileMock).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('allows valid URLs through to execFile', async () => {
      await openExternalProvider.fn!('https://example.com');
      expect(execFileMock).toHaveBeenCalledWith('open', ['https://example.com'], expect.any(Function));
    });
  });

  describe('runOpen — error handling', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      initShellBridgeStandalone();
    });

    it('rejects when execFile returns an error', async () => {
      const error = new Error('open failed');
      execFileMock.mockImplementation((_cmd: string, _args: string[], cb: (err: Error) => void) => cb(error));

      await expect(openFileProvider.fn!('/path/to/file.pdf')).rejects.toThrow('open failed');
    });
  });
});
