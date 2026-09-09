/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { applyAutoModelForTurn } from '@/renderer/utils/autoModel/applyAutoModelForTurn';

const readAutoModelSettingsMock = vi.fn();
const decideAutoModelPhaseMock = vi.fn();
const resolveAutoModelMock = vi.fn();

vi.mock('@/renderer/utils/autoModel/settings', () => ({
  readAutoModelSettings: () => readAutoModelSettingsMock(),
}));

vi.mock('@/renderer/utils/autoModel/decideAutoModelPhase', () => ({
  decideAutoModelPhase: (...args: unknown[]) => decideAutoModelPhaseMock(...args),
}));

vi.mock('@/renderer/utils/autoModel/resolveAutoModel', () => ({
  resolveAutoModel: (...args: unknown[]) => resolveAutoModelMock(...args),
}));

const provider = {
  id: 'p1',
  name: 'p1',
  platform: 'openai',
  models: ['claude-sonnet-4', 'claude-opus-4'],
  enabled: true,
} as IProvider;

const sonnet = { ...provider, use_model: 'claude-sonnet-4' } as TProviderWithModel;
const opus = { ...provider, use_model: 'claude-opus-4' } as TProviderWithModel;

describe('applyAutoModelForTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAutoModelSettingsMock.mockReturnValue({ preference: 'balance', slots: {} });
    decideAutoModelPhaseMock.mockReturnValue('worker');
    resolveAutoModelMock.mockReturnValue({ model: sonnet, slot: 'worker', reason: 'automatic:worker' });
  });

  it('hot-swaps within the same provider without persisting failure', async () => {
    const setConfigOption = vi.fn().mockResolvedValue(undefined);
    const persistModel = vi.fn().mockResolvedValue(true);

    const result = await applyAutoModelForTurn({
      conversationId: 'c1',
      userInput: 'continue',
      hasPriorUserTurns: true,
      currentModel: opus,
      providers: [provider],
      getAvailableModels: (p) => p.models,
      setConfigOption,
      persistModel,
    });

    expect(setConfigOption).toHaveBeenCalledWith('model', 'claude-sonnet-4');
    expect(persistModel).toHaveBeenCalledWith(sonnet, 'worker');
    expect(result.hotSwapped).toBe(true);
  });

  it('persists when hot-swap is unavailable on older Core builds', async () => {
    const setConfigOption = vi.fn().mockRejectedValue(new Error('unsupported'));
    const persistModel = vi.fn().mockResolvedValue(true);

    await applyAutoModelForTurn({
      conversationId: 'c1',
      userInput: 'continue',
      hasPriorUserTurns: true,
      currentModel: opus,
      providers: [provider],
      getAvailableModels: (p) => p.models,
      setConfigOption,
      persistModel,
    });

    expect(persistModel).toHaveBeenCalledWith(sonnet, 'worker');
  });

  it('forwards requireVision to resolveAutoModel', async () => {
    const persistModel = vi.fn().mockResolvedValue(true);

    await applyAutoModelForTurn({
      conversationId: 'c1',
      userInput: 'describe this',
      hasPriorUserTurns: false,
      requireVision: true,
      currentModel: sonnet,
      providers: [provider],
      getAvailableModels: (p) => p.models,
      setConfigOption: vi.fn(),
      persistModel,
    });

    expect(resolveAutoModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requireVision: true,
      })
    );
  });

  it('throws when persistence fails', async () => {
    await expect(
      applyAutoModelForTurn({
        conversationId: 'c1',
        userInput: 'continue',
        hasPriorUserTurns: true,
        currentModel: sonnet,
        providers: [provider],
        getAvailableModels: (p) => p.models,
        setConfigOption: vi.fn(),
        persistModel: vi.fn().mockResolvedValue(false),
      })
    ).rejects.toThrow(/Failed to persist Auto model/);
  });
});
