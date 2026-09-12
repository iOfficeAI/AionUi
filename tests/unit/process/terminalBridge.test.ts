/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { bridge } from '@/common/platform/bridge';
import { initTerminalBridge } from '@/process/bridge/terminalBridge';
import { terminalService } from '@/process/services/terminal';

describe('terminalBridge', () => {
  beforeEach(() => {
    let incoming: { emit: (name: string, data: unknown) => unknown } | undefined;
    bridge.adapter({
      emit(name: string, data: unknown) {
        return incoming?.emit(name, data);
      },
      on(emitter: { emit: (name: string, data: unknown) => unknown }) {
        incoming = emitter;
      },
    });
    initTerminalBridge();
  });

  afterEach(() => {
    terminalService.closeAll();
  });

  it('handles terminal:create through ipcBridge', async () => {
    const session = await ipcBridge.terminal.create.invoke({
      id: 'bridge-test-1',
      cols: 80,
      rows: 24,
    });

    expect(session.id).toBe('bridge-test-1');
    expect(session.shell).toBeTruthy();
    expect(terminalService.hasSession('bridge-test-1')).toBe(true);
  });

  it('handles terminal:write through ipcBridge', async () => {
    const writeSpy = vi.spyOn(terminalService, 'write');

    await ipcBridge.terminal.create.invoke({ id: 'bridge-test-2' });
    await ipcBridge.terminal.write.invoke({ id: 'bridge-test-2', data: 'ls\n' });

    expect(writeSpy).toHaveBeenCalledWith('bridge-test-2', 'ls\n');
    writeSpy.mockRestore();
  });

  it('handles terminal:resize through ipcBridge', async () => {
    const resizeSpy = vi.spyOn(terminalService, 'resize');

    await ipcBridge.terminal.create.invoke({ id: 'bridge-test-3' });
    await ipcBridge.terminal.resize.invoke({ id: 'bridge-test-3', cols: 100, rows: 30 });

    expect(resizeSpy).toHaveBeenCalledWith('bridge-test-3', 100, 30);
    resizeSpy.mockRestore();
  });

  it('handles terminal:kill through ipcBridge', async () => {
    await ipcBridge.terminal.create.invoke({ id: 'bridge-test-4' });
    expect(terminalService.hasSession('bridge-test-4')).toBe(true);

    await ipcBridge.terminal.kill.invoke({ id: 'bridge-test-4' });
    expect(terminalService.hasSession('bridge-test-4')).toBe(false);
  });

  it('dispatches data from service callbacks to terminal:data emitter', async () => {
    const dataListener = vi.fn();
    const dispose = ipcBridge.terminal.onData.on(dataListener);

    await ipcBridge.terminal.create.invoke({ id: 'bridge-test-5' });
    await ipcBridge.terminal.write.invoke({ id: 'bridge-test-5', data: 'echo event_test\n' });

    await vi.waitFor(
      () => {
        expect(dataListener).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );

    dispose();
  });
});
