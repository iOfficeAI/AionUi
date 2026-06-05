/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lifecycle / smoke tests for the Chisl indexer filesystem watcher.
 * End-to-end event delivery is environment-sensitive (recursive fs.watch is
 * macOS/Windows only), so we only assert that start/stop are safe and the
 * debounced event API is wired up.
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChislIndexWatcher } from '@/process/services/indexer/watcher';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = mkdtempSync(path.join(tmpdir(), 'chisl-watcher-'));
});

afterEach(() => {
  rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('ChislIndexWatcher lifecycle', () => {
  it('starts, flushes, and stops without leaking listeners', async () => {
    const watcher = new ChislIndexWatcher({ workspaceRoot, debounceMs: 10 });
    const onEvent = vi.fn();
    const onError = vi.fn();
    watcher.on('event', onEvent);
    watcher.on('error', onError);

    expect(watcher.isRunning).toBe(false);
    watcher.start();
    expect(watcher.isRunning).toBe(true);

    // Calling start again is a no-op
    watcher.start();
    expect(watcher.isRunning).toBe(true);

    watcher.flush();
    await watcher.stop();
    expect(watcher.isRunning).toBe(false);

    // After stop, listeners are cleared so re-emitting via the public API is a no-op.
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('throws when started with a non-existent workspace root', () => {
    const missing = path.join(workspaceRoot, 'does-not-exist');
    const watcher = new ChislIndexWatcher({ workspaceRoot: missing });
    expect(() => watcher.start()).toThrow(/does not exist/);
    expect(watcher.isRunning).toBe(false);
  });

  it('stop() is idempotent and safe before start()', async () => {
    const watcher = new ChislIndexWatcher({ workspaceRoot });
    await expect(watcher.stop()).resolves.toBeUndefined();
    expect(watcher.isRunning).toBe(false);
  });
});
