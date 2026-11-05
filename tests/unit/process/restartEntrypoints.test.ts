/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { installQuitCleanup } from '@/process/startup/quitCleanup';

function sourceSection(file: string, start: string, end: string): string {
  const source = readFileSync(new URL(`../../../packages/desktop/src/${file}`, import.meta.url), 'utf8');
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

function quitFixture() {
  let beforeQuit: ((event: { preventDefault: () => void }) => void) | undefined;
  let finishWrite: (() => void) | undefined;
  const pendingWrite = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  const app = {
    isPackaged: true,
    relaunch: vi.fn(),
    exit: vi.fn(),
    quit: vi.fn(() => beforeQuit?.({ preventDefault: vi.fn() })),
  };
  const stopBackend = vi.fn().mockResolvedValue(undefined);
  installQuitCleanup({
    onBeforeQuit: (handler) => {
      beforeQuit = handler;
    },
    quitApp: app.quit,
    setIsQuitting: vi.fn(),
    markExplicitQuit: vi.fn(),
    destroyTray: vi.fn(),
    disposeCronResumeListener: vi.fn(),
    flushPendingWrites: () => pendingWrite,
    stopBackend,
    destroyPetWindow: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
  });
  return { app, stopBackend, finishWrite: () => finishWrite?.() };
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('restart entrypoints use quit cleanup', () => {
  it('the actual tray restart menu click waits for pending writes', async () => {
    const fixture = quitFixture();
    const section = sourceSection('process/utils/tray.ts', 'const buildTrayContextMenu = async', '\n/**');
    const compiled = transpileModule(section, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;
    const menu = (await runInNewContext(`${compiled}\nbuildTrayContextMenu()`, {
      app: fixture.app,
      isQuitting: false,
      cachedActiveCount: 0,
      ipcBridge: { database: { getUserConversations: { invoke: async () => ({ items: [] }) } } },
      i18n: { t: (key: string) => key },
      Menu: { buildFromTemplate: (template: unknown) => template },
      showAndFocusMainWindow() {},
      hideMainWindowToTray() {},
    })) as Array<{ label?: string; click?: () => void }>;
    menu.find((item) => item.label === 'common.tray.restart')?.click?.();
    expect(fixture.app.relaunch).toHaveBeenCalledOnce();
    expect(fixture.app.quit).toHaveBeenCalledOnce();
    expect(fixture.app.exit).not.toHaveBeenCalled();
    await nextTurn();
    expect(fixture.stopBackend).not.toHaveBeenCalled();
    fixture.finishWrite();
    await nextTurn();
    expect(fixture.stopBackend).toHaveBeenCalledOnce();
  });

  it('the actual renderer crash relaunch handler waits for pending writes', async () => {
    const fixture = quitFixture();
    let onCrash: ((_event: unknown, details: { reason: string }) => void) | undefined;
    const section = sourceSection(
      'index.ts',
      "  mainWindow.webContents.on('render-process-gone'",
      "  mainWindow.webContents.on('unresponsive'"
    );
    runInNewContext(section, {
      app: fixture.app,
      console: { error() {}, warn() {} },
      rendererRecovery: { onCrash: () => ({ kind: 'relaunch' }) },
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          on: (_name: string, handler: typeof onCrash) => {
            onCrash = handler;
          },
        },
      },
    });
    onCrash?.(undefined, { reason: 'launch-failed' });
    expect(fixture.app.relaunch).toHaveBeenCalledOnce();
    expect(fixture.app.quit).toHaveBeenCalledOnce();
    expect(fixture.app.exit).not.toHaveBeenCalled();
    await nextTurn();
    expect(fixture.stopBackend).not.toHaveBeenCalled();
    fixture.finishWrite();
    await nextTurn();
    expect(fixture.stopBackend).toHaveBeenCalledOnce();
  });
});
