/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useWorkspaceApprovals } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceApprovals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the response-stream handler the hook subscribes with so the test
// can synthesise backend stream events (permission / finish / error).
const h = vi.hoisted(() => ({
  streamHandler: undefined as undefined | ((raw: unknown) => void),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      confirmation: {
        list: { invoke: vi.fn().mockResolvedValue([]) },
        confirm: { invoke: vi.fn().mockResolvedValue(undefined) },
        remove: { on: vi.fn(() => vi.fn()) },
      },
      responseStream: {
        on: vi.fn((cb: (raw: unknown) => void) => {
          h.streamHandler = cb;
          return vi.fn();
        }),
      },
    },
  },
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceHasApprovalsEvent: vi.fn(),
}));

function emit(event: Record<string, unknown>) {
  act(() => {
    h.streamHandler?.(event);
  });
}

function permissionEvent(callId: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'acp_permission',
    conversation_id: 'conv-1',
    data: { call_id: callId, description: `do ${callId}`, options: [], ...extra },
  };
}

describe('useWorkspaceApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.streamHandler = undefined;
  });

  it('surfaces a remote acp_permission prompt in the approvals tab', async () => {
    const { result } = renderHook(() => useWorkspaceApprovals('conv-1'));
    await waitFor(() => expect(h.streamHandler).toBeTypeOf('function'));

    emit(permissionEvent('per_1'));

    expect(result.current.hasApprovals).toBe(true);
    expect(result.current.approvals.map((a: { call_id: string }) => a.call_id)).toEqual(['per_1']);
  });

  it('auto-clears pending approvals on the turn-boundary finish event', async () => {
    const { result } = renderHook(() => useWorkspaceApprovals('conv-1'));
    await waitFor(() => expect(h.streamHandler).toBeTypeOf('function'));

    emit(permissionEvent('per_1'));
    emit(permissionEvent('per_2'));
    expect(result.current.approvals).toHaveLength(2);

    // Backend auto-rejects anything still pending when the turn ends; the UI
    // must mirror that by clearing its list so stale cards never linger.
    emit({ type: 'finish', conversation_id: 'conv-1' });
    expect(result.current.approvals).toHaveLength(0);
    expect(result.current.hasApprovals).toBe(false);
  });

  it('auto-clears pending approvals on an error event', async () => {
    const { result } = renderHook(() => useWorkspaceApprovals('conv-1'));
    await waitFor(() => expect(h.streamHandler).toBeTypeOf('function'));

    emit(permissionEvent('per_1'));
    expect(result.current.approvals).toHaveLength(1);

    emit({ type: 'error', conversation_id: 'conv-1' });
    expect(result.current.approvals).toHaveLength(0);
  });

  it('does NOT surface MCP elicitation prompts (they stay inline)', async () => {
    const { result } = renderHook(() => useWorkspaceApprovals('conv-1'));
    await waitFor(() => expect(h.streamHandler).toBeTypeOf('function'));

    emit(permissionEvent('elicit_1', { command_type: 'mcp_elicitation' }));

    expect(result.current.approvals).toHaveLength(0);
    expect(result.current.hasApprovals).toBe(false);
  });

  it('ignores stream events for other conversations', async () => {
    const { result } = renderHook(() => useWorkspaceApprovals('conv-1'));
    await waitFor(() => expect(h.streamHandler).toBeTypeOf('function'));

    emit({ type: 'acp_permission', conversation_id: 'conv-OTHER', data: { call_id: 'x', options: [] } });

    expect(result.current.approvals).toHaveLength(0);
  });
});
