/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';

const {
  getModelInvokeMock,
  setModelInvokeMock,
  conversationUpdateInvokeMock,
  writeRendererLogInvokeMock,
  configServiceSetMock,
  fetchDetectedAgentsMock,
  responseStreamHandlerRef,
} = vi.hoisted(() => ({
  getModelInvokeMock: vi.fn(),
  setModelInvokeMock: vi.fn(),
  conversationUpdateInvokeMock: vi.fn(),
  writeRendererLogInvokeMock: vi.fn(),
  configServiceSetMock: vi.fn(),
  fetchDetectedAgentsMock: vi.fn(),
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
    application: {
      writeRendererLog: { invoke: writeRendererLogInvokeMock },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn().mockReturnValue({}),
    set: configServiceSetMock,
  },
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  DETECTED_AGENTS_SWR_KEY: 'detected-agents',
  fetchDetectedAgents: fetchDetectedAgentsMock,
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const createSwrWrapper = () => {
  const cache = new Map();

  return function SwrTestWrapper({ children }: PropsWithChildren) {
    return createElement(
      SWRConfig,
      {
        value: {
          provider: () => cache,
          dedupingInterval: 0,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        },
      },
      children
    );
  };
};

const renderUseAcpModelInfo = (params: Parameters<typeof useAcpModelInfo>[0]) =>
  renderHook(() => useAcpModelInfo(params), { wrapper: createSwrWrapper() });

describe('useAcpModelInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseStreamHandlerRef.current = undefined;
    getModelInvokeMock.mockReset();
    setModelInvokeMock.mockReset();
    conversationUpdateInvokeMock.mockReset();
    writeRendererLogInvokeMock.mockReset();
    configServiceSetMock.mockReset();
    setModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo() });
    conversationUpdateInvokeMock.mockResolvedValue(true);
    writeRendererLogInvokeMock.mockResolvedValue(undefined);
    configServiceSetMock.mockResolvedValue(undefined);
    fetchDetectedAgentsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses backend current_model_id when reloading even if initialModelId is stale (ELECTRON-1RV)', async () => {
    // Backend is the source of truth: user previously switched to opus-4,
    // but `extra.current_model_id` (initialModelId) still says sonnet-4.
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
    });

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

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'opus-4',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('waits for runtime preparation before loading model info', async () => {
    const prepareRuntimeDeferred = deferred<void>();
    const prepareRuntime = vi.fn().mockReturnValue(prepareRuntimeDeferred.promise);
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      prepareRuntime,
    });

    await waitFor(() => {
      expect(prepareRuntime).toHaveBeenCalledTimes(1);
    });
    expect(getModelInvokeMock).not.toHaveBeenCalled();

    prepareRuntimeDeferred.resolve(undefined);

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(getModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
  });

  it('does not request model info when runtime preparation fails', async () => {
    const prepareRuntime = vi.fn().mockRejectedValue(new Error('warmup failed'));

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      prepareRuntime,
    });

    await waitFor(() => {
      expect(prepareRuntime).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(writeRendererLogInvokeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          tag: 'useAcpModelInfo',
          message: 'prepare_runtime_failed_before_model_reload',
        })
      );
    });
    expect(getModelInvokeMock).not.toHaveBeenCalled();
    expect(result.current.model_info).toBeNull();
  });

  it('does not prepare or request model info while disabled', async () => {
    const prepareRuntime = vi.fn().mockResolvedValue(undefined);
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      prepareRuntime,
      enabled: false,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(prepareRuntime).not.toHaveBeenCalled();
    expect(getModelInvokeMock).not.toHaveBeenCalled();
    expect(result.current.model_info).toBeNull();
    expect(result.current.canSwitch).toBe(false);

    act(() => {
      result.current.selectModel('opus-4');
    });
    expect(setModelInvokeMock).not.toHaveBeenCalled();
  });

  it('saves preferred model and does not persist conversation extra after backend confirms selectModel', async () => {
    const setModelDeferred = deferred<{ model_info: AcpModelInfo | null }>();
    const onSelectModelSuccess = vi.fn();
    const onSelectModelFailed = vi.fn();
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: buildModelInfo() })
      .mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });
    setModelInvokeMock.mockReturnValue(setModelDeferred.promise);

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
      onSelectModelSuccess,
      onSelectModelFailed,
    });

    await waitFor(() => {
      expect(result.current.canSwitch).toBe(true);
    });

    act(() => {
      result.current.selectModel('opus-4');
    });

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });
    expect(configServiceSetMock).not.toHaveBeenCalled();
    expect(conversationUpdateInvokeMock).not.toHaveBeenCalled();

    setModelDeferred.resolve({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(onSelectModelSuccess).toHaveBeenCalledWith('opus-4');
    expect(onSelectModelFailed).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(configServiceSetMock).toHaveBeenCalled();
    });
    const acpConfigCall = configServiceSetMock.mock.calls.find(([key]) => key === 'acp.config');
    expect(acpConfigCall).toBeDefined();
    expect(acpConfigCall?.[1]).toEqual({ claude: { preferredModelId: 'opus-4' } });

    expect(conversationUpdateInvokeMock).not.toHaveBeenCalled();
  });

  it('rolls back to backend model info and does not persist when selectModel fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSelectModelSuccess = vi.fn();
    const onSelectModelFailed = vi.fn();
    const setModelError = new Error('model unavailable');
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo() });
    setModelInvokeMock.mockRejectedValue(setModelError);

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
      onSelectModelSuccess,
      onSelectModelFailed,
    });

    await waitFor(() => {
      expect(result.current.canSwitch).toBe(true);
    });

    act(() => {
      result.current.selectModel('opus-4');
    });

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });
    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('sonnet-4');
    });

    expect(configServiceSetMock).not.toHaveBeenCalled();
    expect(conversationUpdateInvokeMock).not.toHaveBeenCalled();
    expect(onSelectModelFailed).toHaveBeenCalledWith('opus-4', setModelError);
    expect(onSelectModelSuccess).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('does not let initialModelId override backend current_model_id from acp_model_info stream', async () => {
    getModelInvokeMock.mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
    });

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

  it('shares selected model info across hook instances for the same conversation', async () => {
    const setModelDeferred = deferred<{ model_info: AcpModelInfo | null }>();
    const wrapper = createSwrWrapper();
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: buildModelInfo() })
      .mockResolvedValueOnce({ model_info: buildModelInfo() })
      .mockResolvedValue({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });
    setModelInvokeMock.mockReturnValue(setModelDeferred.promise);

    const first = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );
    const second = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(first.result.current.canSwitch).toBe(true);
      expect(second.result.current.canSwitch).toBe(true);
    });

    act(() => {
      first.result.current.selectModel('opus-4');
    });

    await waitFor(() => {
      expect(setModelInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', model_id: 'opus-4' });
    });

    setModelDeferred.resolve({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) });

    await waitFor(() => {
      expect(first.result.current.model_info?.current_model_id).toBe('opus-4');
      expect(second.result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('does not restore stale handshake model when active session lookup returns 404 after cache exists', async () => {
    fetchDetectedAgentsMock.mockResolvedValue([
      {
        agent_type: 'claude',
        backend: 'claude',
        handshake: {
          available_models: buildModelInfo({
            current_model_id: 'deepseek-v4-pro',
            current_model_label: 'DeepSeek V4 Pro',
            available_models: [{ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }],
          }),
        },
      },
    ]);
    getModelInvokeMock
      .mockResolvedValueOnce({ model_info: buildModelInfo({ current_model_id: 'opus-4' }) })
      .mockRejectedValueOnce({
        name: 'BackendHttpError',
        status: 404,
        code: 'NOT_FOUND',
        message: 'no active session',
      });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'deepseek-v4-pro',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });

    vi.useFakeTimers();
    await act(async () => {
      responseStreamHandlerRef.current?.({
        type: 'start',
        conversation_id: 'conv-1',
      } as unknown as IResponseMessage);
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(getModelInvokeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.model_info?.current_model_id).toBe('opus-4');
    vi.clearAllTimers();
  });
});
