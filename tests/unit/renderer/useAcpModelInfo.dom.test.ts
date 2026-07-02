/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpConfigOptionDto, AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { resetEnsureConversationRuntimeStateForTests } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';

const { ensureRuntimeInvokeMock, setConfigOptionInvokeMock, responseStreamHandlers } = vi.hoisted(() => ({
  ensureRuntimeInvokeMock: vi.fn(),
  setConfigOptionInvokeMock: vi.fn(),
  responseStreamHandlers: [] as Array<(message: IResponseMessage) => void>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      ensureRuntime: { invoke: ensureRuntimeInvokeMock },
    },
    acpConversation: {
      setConfigOption: { invoke: setConfigOptionInvokeMock },
      responseStream: {
        on: vi.fn().mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlers.push(handler);
          return () => {
            const index = responseStreamHandlers.indexOf(handler);
            if (index >= 0) responseStreamHandlers.splice(index, 1);
          };
        }),
      },
    },
  },
}));

const buildConfigOptions = (currentModelId = 'sonnet-4'): AcpConfigOptionDto[] => [
  {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: currentModelId,
    options: [
      { value: 'sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'opus-4', label: 'Claude Opus 4' },
    ],
  },
  {
    id: 'thought_level',
    category: 'thought_level',
    option_type: 'select',
    current_value: 'medium',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
    ],
  },
];

const buildLegacyModelInfo = (overrides: Partial<AcpModelInfo> = {}): AcpModelInfo => ({
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

const emitStream = (message: IResponseMessage) => {
  for (const handler of responseStreamHandlers) {
    handler(message);
  }
};

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
    responseStreamHandlers.length = 0;
    resetEnsureConversationRuntimeStateForTests();
    ensureRuntimeInvokeMock.mockReset();
    setConfigOptionInvokeMock.mockReset();
    ensureRuntimeInvokeMock.mockResolvedValue({ recovered: true, config_options: buildConfigOptions(), runtime: null });
    setConfigOptionInvokeMock.mockResolvedValue({
      confirmation: 'observed',
      config_options: buildConfigOptions('opus-4'),
    });
  });

  it('derives model info from the model config option and ignores thought_level values', async () => {
    ensureRuntimeInvokeMock.mockResolvedValue({
      recovered: true,
      config_options: buildConfigOptions('opus-4'),
      runtime: null,
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(result.current.model_info?.available_models.map((model) => model.id)).toEqual(['sonnet-4', 'opus-4']);
    expect(result.current.canSwitch).toBe(true);
    expect(ensureRuntimeInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
  });

  it('preserves model option descriptions from config options', async () => {
    ensureRuntimeInvokeMock.mockResolvedValue({
      recovered: true,
      config_options: [
        {
          id: 'model',
          category: 'model',
          type: 'select',
          current_value: 'default',
          options: [
            {
              value: 'default',
              name: 'Default (recommended)',
              description: 'Use the default model (currently Opus 4.8) · $5/$25 per Mtok',
            },
            {
              value: 'opus',
              name: 'claude-opus-4-8',
              description: 'Custom Opus model (1M context)',
            },
          ],
        },
      ],
      runtime: null,
    });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('default');
    });
    expect(result.current.model_info?.available_models).toEqual([
      {
        id: 'default',
        label: 'Default (recommended)',
        description: 'Use the default model (currently Opus 4.8) · $5/$25 per Mtok',
      },
      {
        id: 'opus',
        label: 'claude-opus-4-8',
        description: 'Custom Opus model (1M context)',
      },
    ]);
  });

  it('waits for observed confirmation before updating selected model without persisting a global preference', async () => {
    const setConfigDeferred = deferred<{
      confirmation: 'observed';
      config_options: AcpConfigOptionDto[];
    }>();
    const onSelectModelSuccess = vi.fn();
    const onSelectModelFailed = vi.fn();
    setConfigOptionInvokeMock.mockReturnValue(setConfigDeferred.promise);

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
      expect(setConfigOptionInvokeMock).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        option_id: 'model',
        value: 'opus-4',
      });
    });
    expect(result.current.model_info?.current_model_id).toBe('sonnet-4');
    expect(result.current.isSetting).toBe(true);

    await act(async () => {
      setConfigDeferred.resolve({
        confirmation: 'observed',
        config_options: buildConfigOptions('opus-4'),
      });
      await setConfigDeferred.promise;
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(onSelectModelSuccess).toHaveBeenCalledWith('opus-4');
    expect(onSelectModelFailed).not.toHaveBeenCalled();
  });

  it('does not update model info when backend only returns command acknowledgement', async () => {
    const onSelectModelSuccess = vi.fn();
    const onSelectModelFailed = vi.fn();
    setConfigOptionInvokeMock.mockResolvedValue({
      confirmation: 'command_ack',
      config_options: null,
    });

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
      expect(onSelectModelFailed).toHaveBeenCalledWith('opus-4', expect.any(Error));
    });
    expect(result.current.model_info?.current_model_id).toBe('sonnet-4');
    expect(onSelectModelSuccess).not.toHaveBeenCalled();
  });

  it('shares observed model snapshots across hook instances for the same conversation', async () => {
    const wrapper = createSwrWrapper();
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
      expect(first.result.current.model_info?.current_model_id).toBe('opus-4');
      expect(second.result.current.model_info?.current_model_id).toBe('opus-4');
    });
  });

  it('coalesces concurrent runtime ensure loads for the same conversation', async () => {
    const ensureDeferred = deferred<{
      recovered: boolean;
      config_options: AcpConfigOptionDto[];
      runtime: null;
    }>();
    ensureRuntimeInvokeMock.mockReturnValue(ensureDeferred.promise);

    const wrapper = createSwrWrapper();
    const first = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );
    const second = renderHook(
      () => useAcpModelInfo({ conversation_id: 'conv-1', backend: 'claude', initialModelId: 'sonnet-4' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      ensureDeferred.resolve({ recovered: true, config_options: buildConfigOptions(), runtime: null });
      await ensureDeferred.promise;
    });

    await waitFor(() => {
      expect(first.result.current.canSwitch).toBe(true);
      expect(second.result.current.canSwitch).toBe(true);
    });
    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('uses legacy acp_model_info stream only before config options are available', async () => {
    ensureRuntimeInvokeMock.mockResolvedValue({ recovered: true, config_options: [], runtime: null });

    const { result } = renderUseAcpModelInfo({
      conversation_id: 'conv-1',
      backend: 'claude',
      initialModelId: 'sonnet-4',
    });

    await waitFor(() => {
      expect(responseStreamHandlers.length).toBeGreaterThan(0);
    });

    act(() => {
      emitStream({
        type: 'acp_model_info',
        conversation_id: 'conv-1',
        data: buildLegacyModelInfo({ current_model_id: 'opus-4' }),
      } as unknown as IResponseMessage);
    });

    await waitFor(() => {
      expect(result.current.model_info?.current_model_id).toBe('opus-4');
    });
    expect(result.current.canSwitch).toBe(false);
  });
});
