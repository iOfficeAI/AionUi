/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  TERMINAL_EXEC_EVENT,
  dispatchTerminalExecEvent,
  listenTerminalExecEvent,
} from '@/renderer/pages/conversation/Terminal/terminalEvents';
import { WORKSPACE_ENSURE_OPEN_EVENT } from '@/renderer/utils/workspace/workspaceEvents';

describe('terminalEvents', () => {
  it('dispatches TERMINAL_EXEC_EVENT and WORKSPACE_ENSURE_OPEN_EVENT', () => {
    const execListener = vi.fn();
    const ensureOpenListener = vi.fn();

    window.addEventListener(TERMINAL_EXEC_EVENT, execListener);
    window.addEventListener(WORKSPACE_ENSURE_OPEN_EVENT, ensureOpenListener);

    dispatchTerminalExecEvent('git status', 'proj-123');

    expect(execListener).toHaveBeenCalledTimes(1);
    const event = execListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ command: 'git status', projectId: 'proj-123' });

    expect(ensureOpenListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(TERMINAL_EXEC_EVENT, execListener);
    window.removeEventListener(WORKSPACE_ENSURE_OPEN_EVENT, ensureOpenListener);
  });

  it('listenTerminalExecEvent invokes callback on event and cleans up listener on unlisten', () => {
    const callback = vi.fn();
    const unlisten = listenTerminalExecEvent(callback);

    dispatchTerminalExecEvent('npm test');
    expect(callback).toHaveBeenCalledWith({ command: 'npm test', projectId: undefined });

    unlisten();

    dispatchTerminalExecEvent('npm run build');
    expect(callback).toHaveBeenCalledTimes(1); // Not called a second time
  });

  it('dispatchWorkspaceEnsureOpenEvent fires WORKSPACE_ENSURE_OPEN_EVENT', async () => {
    const { dispatchWorkspaceEnsureOpenEvent } = await import('@/renderer/utils/workspace/workspaceEvents');
    const listener = vi.fn();
    window.addEventListener(WORKSPACE_ENSURE_OPEN_EVENT, listener);

    dispatchWorkspaceEnsureOpenEvent();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(WORKSPACE_ENSURE_OPEN_EVENT, listener);
  });
});
