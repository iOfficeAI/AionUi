/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '../../../../src/common/config/storage';

const modelSelectionStorageMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
}));

const modelSelectionBridgeMocks = vi.hoisted(() => ({
  getModelConfig: vi.fn(),
  providers: [
    {
      id: 'provider-a',
      name: 'Provider A',
      platform: 'custom',
      baseUrl: '',
      apiKey: 'a',
      model: ['model-a'],
    },
    {
      id: 'provider-b',
      name: 'Provider B',
      platform: 'chatgpt',
      baseUrl: 'https://chatgpt.com',
      apiKey: '',
      model: ['model-b'],
    },
  ],
}));

vi.mock('../../../../src/common', () => ({
  ipcBridge: {
    mode: {
      getModelConfig: { invoke: modelSelectionBridgeMocks.getModelConfig },
    },
  },
}));

vi.mock('../../../../src/common/config/storage', () => ({
  ConfigStorage: modelSelectionStorageMock,
}));

vi.mock('../../../../src/common/utils', () => ({
  uuid: () => 'generated-gemini-provider',
}));

vi.mock('../../../../src/renderer/hooks/agent/useGeminiGoogleAuthModels', () => ({
  useGeminiGoogleAuthModels: () => ({
    geminiModeOptions: [],
    isGoogleAuth: false,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({ data: modelSelectionBridgeMocks.providers, error: undefined, mutate: vi.fn() }),
}));

import { useGuidModelSelection } from '../../../../src/renderer/pages/guid/hooks/useGuidModelSelection';

const PROVIDERS = modelSelectionBridgeMocks.providers as IProvider[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('useGuidModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelSelectionBridgeMocks.getModelConfig.mockResolvedValue(PROVIDERS);
  });

  it('does not let delayed default loading overwrite a user-selected provider', async () => {
    const savedDefault = deferred<{ id: string; useModel: string }>();
    modelSelectionStorageMock.get.mockReturnValue(savedDefault.promise);

    const { result } = renderHook(() => useGuidModelSelection('aionrs'));

    await waitFor(() => {
      expect(result.current.modelList).toHaveLength(2);
    });

    await act(async () => {
      await result.current.setCurrentModel({ ...PROVIDERS[1], useModel: 'model-b' });
    });

    expect(result.current.currentModel?.id).toBe('provider-b');

    await act(async () => {
      savedDefault.resolve({ id: 'provider-a', useModel: 'model-a' });
      await savedDefault.promise;
    });

    await waitFor(() => {
      expect(result.current.currentModel?.id).toBe('provider-b');
      expect(result.current.currentModel?.useModel).toBe('model-b');
    });
  });
});
