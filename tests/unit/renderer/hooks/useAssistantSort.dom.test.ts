/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Assistant } from '@/common/types/agent/assistantTypes';

const configMock = vi.hoisted(() => {
  const state: { value: Record<string, unknown> } = { value: {} };
  const listeners: Set<() => void> = new Set();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    state,
    listeners,
    notify,
    service: {
      get: vi.fn((key: string) => state.value[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        state.value[key] = value;
        notify();
      }),
      setLocal: vi.fn((key: string, value: unknown) => {
        state.value[key] = value;
        notify();
      }),
      subscribe: vi.fn((_key: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    },
  };
});

vi.mock('@/common/config/configService', () => ({
  configService: configMock.service,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' } }),
}));

import { useAssistantSort } from '@/renderer/hooks/assistant/useAssistantSort';

const mk = (id: string, name = id): Assistant =>
  ({
    id,
    source: 'user',
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: true,
  }) as Assistant;

describe('useAssistantSort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMock.state.value = {};
    configMock.service.set.mockImplementation(async (key, value) => {
      configMock.state.value[key] = value;
      configMock.notify();
    });
    configMock.service.setLocal.mockImplementation((key, value) => {
      configMock.state.value[key] = value;
      configMock.notify();
    });
  });

  it('defaults to manual strategy and empty usage', () => {
    const { result } = renderHook(() => useAssistantSort());
    expect(result.current.strategy).toBe('manual');
    expect(result.current.usage).toEqual({});
  });

  it('normalizes a persisted strategy and usage', () => {
    configMock.state.value = {
      'assistants.sortStrategy': 'recent',
      'assistants.usage': { writer: { lastUsedAt: 100, useCount: 2 }, bad: {} },
    };
    const { result } = renderHook(() => useAssistantSort());
    expect(result.current.strategy).toBe('recent');
    expect(result.current.usage).toEqual({ writer: { lastUsedAt: 100, useCount: 2 } });
  });

  it('sorts assistants according to the active strategy', () => {
    configMock.state.value = {
      'assistants.sortStrategy': 'recent',
      'assistants.usage': { bravo: { lastUsedAt: 200 }, charlie: { lastUsedAt: 100 } },
    };
    const { result } = renderHook(() => useAssistantSort());
    const sorted = result.current.sortAssistants([mk('alpha'), mk('bravo'), mk('charlie'), mk('delta')]);
    expect(sorted.map((a) => a.id)).toEqual(['bravo', 'charlie', 'alpha', 'delta']);
  });

  it('setStrategy persists a normalized strategy', async () => {
    const { result } = renderHook(() => useAssistantSort());
    await act(async () => {
      await result.current.setStrategy('alphabetical');
    });
    expect(configMock.service.set).toHaveBeenCalledWith('assistants.sortStrategy', 'alphabetical');
    expect(configMock.state.value['assistants.sortStrategy']).toBe('alphabetical');
  });

  it('recordUse increments count and stamps time, merged over existing usage', async () => {
    configMock.state.value['assistants.usage'] = { writer: { lastUsedAt: 100, useCount: 1 } };
    const { result } = renderHook(() => useAssistantSort());
    await act(async () => {
      await result.current.recordUse('writer');
      await result.current.recordUse('hermes');
    });
    const persisted = configMock.state.value['assistants.usage'] as Record<
      string,
      { lastUsedAt: number; useCount: number }
    >;
    expect(persisted.writer.useCount).toBe(2);
    expect(persisted.writer.lastUsedAt).toBeGreaterThan(100);
    expect(persisted.hermes).toEqual({ lastUsedAt: expect.any(Number), useCount: 1 });
  });

  it('restores the previous cache value when persistence fails', async () => {
    configMock.state.value['assistants.sortStrategy'] = 'manual';
    configMock.service.set.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAssistantSort());
    let error: unknown;
    await act(async () => {
      try {
        await result.current.setStrategy('recent');
      } catch (caught) {
        error = caught;
      }
    });
    expect(error).toBeInstanceOf(Error);
    expect(configMock.service.setLocal).toHaveBeenCalledWith('assistants.sortStrategy', 'manual');
    expect(result.current.strategy).toBe('manual');
  });
});
