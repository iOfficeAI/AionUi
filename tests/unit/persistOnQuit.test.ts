/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { appHandlers, appQuit } = vi.hoisted(() => ({
  appHandlers: {} as Record<string, Array<(...args: unknown[]) => void>>,
  appQuit: vi.fn(),
}));

const fireAppEvent = (event: string, ...args: unknown[]) => {
  for (const fn of appHandlers[event] ?? []) fn(...args);
};

vi.mock('electron', () => ({
  app: {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      (appHandlers[event] ??= []).push(fn);
    },
    quit: appQuit,
  },
}));

import { trackPersistedWrite, __resetPersistOnQuitForTests } from '@/process/utils/persistOnQuit';

describe('persistOnQuit', () => {
  beforeEach(() => {
    for (const key of Object.keys(appHandlers)) delete appHandlers[key];
    appQuit.mockReset();
    __resetPersistOnQuitForTests();
  });

  it('defers app.quit until a pending write resolves', async () => {
    let resolveWrite: (() => void) | undefined;
    trackPersistedWrite(
      new Promise<void>((r) => {
        resolveWrite = r;
      })
    );

    const preventDefault = vi.fn();
    fireAppEvent('before-quit', { preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(appQuit).not.toHaveBeenCalled();

    resolveWrite?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(appQuit).toHaveBeenCalled();
  });

  it('does not block quit when no writes are pending', async () => {
    // Track a write and let it settle so the pending set is empty.
    trackPersistedWrite(Promise.resolve());
    await Promise.resolve();
    await Promise.resolve();

    const preventDefault = vi.fn();
    fireAppEvent('before-quit', { preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('still allows quit when a tracked write rejects', async () => {
    let rejectWrite: ((reason: Error) => void) | undefined;
    trackPersistedWrite(
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      })
    );

    const preventDefault = vi.fn();
    fireAppEvent('before-quit', { preventDefault });
    expect(preventDefault).toHaveBeenCalled();

    rejectWrite?.(new Error('disk full'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(appQuit).toHaveBeenCalled();
  });

  it('keeps blocking repeated before-quit events while writes are still flushing', async () => {
    let resolveWrite: (() => void) | undefined;
    trackPersistedWrite(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      })
    );

    const firstPreventDefault = vi.fn();
    fireAppEvent('before-quit', { preventDefault: firstPreventDefault });
    expect(firstPreventDefault).toHaveBeenCalled();

    const secondPreventDefault = vi.fn();
    fireAppEvent('before-quit', { preventDefault: secondPreventDefault });
    expect(secondPreventDefault).toHaveBeenCalled();
    expect(appQuit).not.toHaveBeenCalled();

    resolveWrite?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(appQuit).toHaveBeenCalled();
  });
});
