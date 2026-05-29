/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';

const {
  getModelInvokeMock,
  setModelInvokeMock,
  conversationUpdateInvokeMock,
  configServiceSetMock,
  responseStreamHandlerRef,
} = vi.hoisted(() => ({
  getModelInvokeMock: vi.fn(),
  setModelInvokeMock: vi.fn(),
  conversationUpdateInvokeMock: vi.fn(),
  configServiceSetMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModel: { invoke: getModelInvokeMock },
      setModel: { invoke: setModelInvokeMock },
      responseStream: {
        on: vi.fn().mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
    },
    conversation: {
      update: { invoke: conversationUpdateInvokeMock },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn().mockReturnValue({}),
    set: configServiceSetMock,
  },
}));

vi.mock('swr', () => ({
  default: () => ({ data: undefined }),
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  DETECTED_AGENTS_SWR_KEY: 'detected-agents',
  fetchDetectedAgents: vi.fn(),
}));

const buildModelInfo = (overrides: Partial<AcpModelInfo> = {}): AcpModelInfo => ({
  current_model_id: 'sonnet-4',
  current_model_label: 'Claude Sonnet 4',
  available_models: [
    { id: 'sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'opus-4', label: 'Claude Opus 4' },
  ],
  ...overrides,
});

describe('useAcpModelInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseStreamHandlerRef.current = undefined;
    getModelInvokeMock.mockReset();
    setModelInvokeMock.mockReset();
    conversationUpdateInvokeMock.mockReset();
    configServiceSetMock.mockReset();
    setModelInvokeMock.mockResolvedValue(undefined);
    conversationUpdateInvokeMock.mockResolvedValue(true);
    configServiceSetMock.mockResolvedValue(undefined);
  });

  it('uses backend current_model_id when reloading even if initialModelId is stale (ELECTRON-1RV)', async () => {
    // Backend is the source of truth: user previously switched to opus-4,
    // but `extra.current_model_id` (initialModelId) still says sonnet-4.
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderHook(() =>
      useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' })
    );

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('falls back to initialModelId only when backend has no current_model_id', async () => {
    // Genuine pre-handshake state: backend returns the available list but no
    // current model yet. initialModelId from Guid pre-selection is honored.
    getModelInvokeMock.mockResolvedValue({
      model_info: buildModelInfo({ current_model_id: '' as unknown as string }),
    });

    const { result } = renderHook(() =>
      useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'opus-4' })
    );

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('persists preferred model and conversation extra on selectModel', async () => {
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo() });

    const { result } = renderHook(() =>
      useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' })
    );

    await waitFor(() => {
      expect(result.current.canSwitch).toBe(true);
    });

    result.current.selectModel('opus-4');

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });
    await waitFor(() => {
      expect(configServiceSetMock).toHaveBeenCalled();
    });
    const acpConfigCall = configServiceSetMock.mock.calls.find(([key]) => key === 'acp.config');
    expect(acpConfigCall).toBeDefined();
    expect(acpConfigCall?.[1]).toEqual({ claude: { preferredModelId: 'opus-4' } });

    expect(conversationUpdateInvokeMock).toHaveBeenCalledWith({
      id: 'conv-1',
      updates: { extra: { current_model_id: 'opus-4' } },
      merge_extra: true,
    });
  });

  it('does not let initialModelId override backend current_model_id from acp_model_info stream', async () => {
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderHook(() =>
      useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' })
    );

    await waitFor(() => {
      expect(responseStreamHandlerRef.current).toBeTypeOf('function');
    });

    responseStreamHandlerRef.current?.({
      type: 'acp_model_info',
      conversation_id: 'conv-1',
      data: buildModelInfo({ current_model_id: 'opus-4' }),
    } as unknown as IResponseMessage);

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });
});
