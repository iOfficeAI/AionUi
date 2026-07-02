/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for ELECTRON-1A1:
 * `TypeError: Cannot read properties of null (reading 'addInstance')`.
 *
 * The MCP connection test queues its result message (`message.warning/success/error`)
 * behind an async network round-trip plus a 100ms inter-message delay. If the host
 * component (ToolsModalContent) unmounts during that window, Arco's message context
 * holder becomes null and `message.*` throws `null.addInstance`. The thrown error
 * escapes the queue callback and surfaces as an unhandled rejection.
 *
 * The fix wraps every queued `message.*` call in try/catch so a post-unmount call
 * is silently dropped instead of crashing the renderer.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMcpConnection } from '@/renderer/hooks/mcp/useMcpConnection';
import { globalMessageQueue } from '@/renderer/hooks/mcp/messageQueue';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    testMcpConnection: { invoke: vi.fn() },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  isBackendHttpError: () => false,
}));

const server: IMcpServer = {
  id: 'srv-1',
  name: 'My Server',
  transport: { type: 'stdio', command: 'node', args: [] },
} as unknown as IMcpServer;

/**
 * Simulates Arco's message instance after the context holder unmounts: every
 * method throws the exact error seen in ELECTRON-1A1.
 */
const makeUnmountedMessage = () => {
  const thrower = () => {
    throw new TypeError("Cannot read properties of null (reading 'addInstance')");
  };
  return {
    warning: vi.fn(thrower),
    success: vi.fn(thrower),
    error: vi.fn(thrower),
  } as unknown as Parameters<typeof useMcpConnection>[1];
};

describe('useMcpConnection — ELECTRON-1A1 unmount race', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when the success message fires after the context unmounts', async () => {
    vi.mocked(mcpService.testMcpConnection.invoke).mockResolvedValue({ success: true, tools: [] } as never);
    const message = makeUnmountedMessage();
    const addSpy = vi.spyOn(globalMessageQueue, 'add');

    const { result } = renderHook(() => useMcpConnection(vi.fn(), message));

    await act(async () => {
      await result.current.handleTestMcpConnection(server);
    });

    expect(addSpy).toHaveBeenCalled();
    // Replaying every queued callback must not propagate the Arco crash.
    for (const call of addSpy.mock.calls) {
      const fn = call[0];
      expect(() => fn()).not.toThrow();
    }

    addSpy.mockRestore();
  });

  it('does not throw when the auth-required warning fires after the context unmounts', async () => {
    vi.mocked(mcpService.testMcpConnection.invoke).mockResolvedValue({ needsAuth: true } as never);
    const message = makeUnmountedMessage();
    const addSpy = vi.spyOn(globalMessageQueue, 'add');

    const { result } = renderHook(() => useMcpConnection(vi.fn(), message));

    await act(async () => {
      await result.current.handleTestMcpConnection(server);
    });

    for (const call of addSpy.mock.calls) {
      const fn = call[0];
      expect(() => fn()).not.toThrow();
    }

    addSpy.mockRestore();
  });

  it('does not throw when the failure message fires after the context unmounts', async () => {
    vi.mocked(mcpService.testMcpConnection.invoke).mockResolvedValue({ success: false, error: 'boom' } as never);
    const message = makeUnmountedMessage();
    const addSpy = vi.spyOn(globalMessageQueue, 'add');

    const { result } = renderHook(() => useMcpConnection(vi.fn(), message));

    await act(async () => {
      await result.current.handleTestMcpConnection(server);
    });

    for (const call of addSpy.mock.calls) {
      const fn = call[0];
      expect(() => fn()).not.toThrow();
    }

    addSpy.mockRestore();
  });

  it('does not throw when the thrown-error message fires after the context unmounts', async () => {
    vi.mocked(mcpService.testMcpConnection.invoke).mockRejectedValue(new Error('network down'));
    const message = makeUnmountedMessage();
    const addSpy = vi.spyOn(globalMessageQueue, 'add');

    const { result } = renderHook(() => useMcpConnection(vi.fn(), message));

    await act(async () => {
      await result.current.handleTestMcpConnection(server);
    });

    for (const call of addSpy.mock.calls) {
      const fn = call[0];
      expect(() => fn()).not.toThrow();
    }

    addSpy.mockRestore();
  });

  it('still shows the success message when the context is alive', async () => {
    vi.mocked(mcpService.testMcpConnection.invoke).mockResolvedValue({ success: true, tools: [] } as never);
    const success = vi.fn();
    const message = { warning: vi.fn(), success, error: vi.fn() } as unknown as Parameters<typeof useMcpConnection>[1];

    const { result } = renderHook(() => useMcpConnection(vi.fn(), message));

    await act(async () => {
      await result.current.handleTestMcpConnection(server);
    });

    await waitFor(() => {
      expect(success).toHaveBeenCalledWith(expect.stringContaining('My Server'));
    });
  });
});
