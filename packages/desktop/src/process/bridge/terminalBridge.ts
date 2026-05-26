/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridges the renderer's terminal IPC namespace to the main-process
 * `TerminalService` singleton. Output and exit events are streamed to all
 * renderer windows via `bridge.buildEmitter`, which the adapter broadcasts via
 * `webContents.send`.
 */

import { ipcBridge } from '@/common';
import { getTerminalService } from '@process/services/terminal/TerminalService';

let outputUnsubscribe: (() => void) | null = null;
let exitUnsubscribe: (() => void) | null = null;

export function initTerminalBridge(): void {
  const service = getTerminalService();

  // Forward PTY stdout/stderr to every renderer.
  if (!outputUnsubscribe) {
    const handler = (event: { session_id: string; data: string }) => {
      ipcBridge.terminal.output.emit(event);
    };
    service.on('output', handler);
    outputUnsubscribe = () => service.off('output', handler);
  }

  // Forward exit/close events.
  if (!exitUnsubscribe) {
    const handler = (event: Parameters<typeof ipcBridge.terminal.exit.emit>[0]) => {
      ipcBridge.terminal.exit.emit(event);
    };
    service.on('exit', handler);
    exitUnsubscribe = () => service.off('exit', handler);
  }

  ipcBridge.terminal.spawn.provider(async (options) => {
    try {
      const result = service.spawn(options ?? {});
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[TerminalBridge] spawn failed:', error);
      return { success: false, msg: message };
    }
  });

  ipcBridge.terminal.write.provider(async ({ session_id, data }) => {
    const ok = service.write(session_id, data);
    return ok ? { success: true } : { success: false, msg: `Unknown session ${session_id}` };
  });

  ipcBridge.terminal.resize.provider(async ({ session_id, cols, rows }) => {
    const ok = service.resize(session_id, cols, rows);
    return ok ? { success: true } : { success: false, msg: `Unknown session ${session_id}` };
  });

  ipcBridge.terminal.kill.provider(async ({ session_id }) => {
    const ok = service.kill(session_id);
    return ok ? { success: true } : { success: false, msg: `Unknown session ${session_id}` };
  });
}

/**
 * Tear down the bridge subscriptions. Sessions themselves are killed via
 * `TerminalService.killAll()` from the app `before-quit` hook.
 */
export function disposeTerminalBridge(): void {
  outputUnsubscribe?.();
  outputUnsubscribe = null;
  exitUnsubscribe?.();
  exitUnsubscribe = null;
}
