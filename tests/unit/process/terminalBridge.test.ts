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
    const spy = vi.spyOn(terminalService, 'createSession').mockReturnValueOnce({
      id: 'bridge-test-1',
      shell: '/bin/bash',
      cwd: '/test/cwd',
    });

    const session = await ipcBridge.terminal.create.invoke({
      id: 'bridge-test-1',
      cols: 80,
      rows: 24,
    });

    expect(spy).toHaveBeenCalledWith({ id: 'bridge-test-1', cols: 80, rows: 24 });
    expect(session.id).toBe('bridge-test-1');
    expect(session.shell).toBe('/bin/bash');
  });

  it('handles terminal:write through ipcBridge', async () => {
    const writeSpy = vi.spyOn(terminalService, 'write').mockReturnValueOnce();

    await ipcBridge.terminal.write.invoke({ id: 'bridge-test-2', data: 'ls\n' });

    expect(writeSpy).toHaveBeenCalledWith('bridge-test-2', 'ls\n');
  });

  it('handles terminal:resize through ipcBridge', async () => {
    const resizeSpy = vi.spyOn(terminalService, 'resize').mockReturnValueOnce();

    await ipcBridge.terminal.resize.invoke({ id: 'bridge-test-3', cols: 100, rows: 30 });

    expect(resizeSpy).toHaveBeenCalledWith('bridge-test-3', 100, 30);
  });

  it('handles terminal:kill through ipcBridge', async () => {
    const killSpy = vi.spyOn(terminalService, 'kill').mockReturnValueOnce();

    await ipcBridge.terminal.kill.invoke({ id: 'bridge-test-4' });

    expect(killSpy).toHaveBeenCalledWith('bridge-test-4');
  });

  it('dispatches data and exit from service callbacks to emitters', async () => {
    let capturedCallbacks: {
      onData?: (event: { id: string; data: string }) => void;
      onExit?: (event: { id: string; exitCode: number }) => void;
    } = {};

    vi.spyOn(terminalService, 'setCallbacks').mockImplementation((callbacks) => {
      capturedCallbacks = callbacks;
    });

    initTerminalBridge();

    const dataListener = vi.fn();
    const exitListener = vi.fn();
    const disposeData = ipcBridge.terminal.onData.on(dataListener);
    const disposeExit = ipcBridge.terminal.onExit.on(exitListener);

    capturedCallbacks.onData?.({ id: 'session-1', data: 'hello output' });
    capturedCallbacks.onExit?.({ id: 'session-1', exitCode: 0 });

    expect(dataListener).toHaveBeenCalledWith({ id: 'session-1', data: 'hello output' });
    expect(exitListener).toHaveBeenCalledWith({ id: 'session-1', exitCode: 0 });

    disposeData();
    disposeExit();
  });
});
