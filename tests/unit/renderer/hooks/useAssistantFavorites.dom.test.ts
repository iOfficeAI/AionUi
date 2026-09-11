/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUID_FAVORITE_ASSISTANTS_CONFIG_KEY,
  normalizeFavoriteAssistantIds,
  persistFavoriteAssistantIds,
  toggleFavoriteAssistantId,
  useAssistantFavorites,
} from '@/renderer/hooks/assistant/useAssistantFavorites';

const { configGetMock, configSetMock, configSetLocalMock, configSubscribeMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  configSetLocalMock: vi.fn(),
  configSubscribeMock: vi.fn(() => () => {}),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    set: configSetMock,
    setLocal: configSetLocalMock,
    subscribe: configSubscribeMock,
  },
}));

describe('normalizeFavoriteAssistantIds', () => {
  it('returns an empty array for non-array input', () => {
    expect(normalizeFavoriteAssistantIds(undefined)).toEqual([]);
    expect(normalizeFavoriteAssistantIds(null as unknown as string[])).toEqual([]);
    expect(normalizeFavoriteAssistantIds('writer' as unknown as string[])).toEqual([]);
  });

  it('trims whitespace and drops empty strings', () => {
    expect(normalizeFavoriteAssistantIds(['  writer  ', '', '  ', 'cowork'])).toEqual(['writer', 'cowork']);
  });

  it('deduplicates ids while preserving first occurrence order', () => {
    expect(normalizeFavoriteAssistantIds(['writer', 'cowork', 'writer', 'writer'])).toEqual(['writer', 'cowork']);
  });

  it('drops non-string entries', () => {
    expect(
      normalizeFavoriteAssistantIds(['writer', 42 as unknown as string, null as unknown as string, 'cowork'])
    ).toEqual(['writer', 'cowork']);
  });
});

describe('toggleFavoriteAssistantId', () => {
  it('prepends a new favorite id', () => {
    expect(toggleFavoriteAssistantId(['cowork'], 'writer')).toEqual(['writer', 'cowork']);
  });

  it('prepends when the list is empty', () => {
    expect(toggleFavoriteAssistantId([], 'writer')).toEqual(['writer']);
  });

  it('removes an existing favorite id without mutating the input', () => {
    const current = ['writer', 'cowork'];
    const result = toggleFavoriteAssistantId(current, 'writer');
    expect(result).toEqual(['cowork']);
    expect(current).toEqual(['writer', 'cowork']);
  });
});

describe('persistFavoriteAssistantIds', () => {
  beforeEach(() => {
    configGetMock.mockReturnValue(undefined);
    configSetMock.mockResolvedValue(undefined);
    configSetLocalMock.mockClear();
  });

  it('persists the normalized ids through configService.set', async () => {
    configGetMock.mockReturnValue(['writer']);
    await persistFavoriteAssistantIds([' writer ', 'cowork', ' writer ']);

    expect(configSetMock).toHaveBeenCalledWith(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY, ['writer', 'cowork']);
  });

  it('restores the previous value via setLocal and rethrows on failure', async () => {
    configGetMock.mockReturnValue(['writer']);
    configSetMock.mockRejectedValueOnce(new Error('backend unavailable'));

    await expect(persistFavoriteAssistantIds(['cowork'])).rejects.toThrow('backend unavailable');
    expect(configSetLocalMock).toHaveBeenCalledWith(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY, ['writer']);
  });

  it('restores an undefined previous value via setLocal on failure', async () => {
    configGetMock.mockReturnValue(undefined);
    configSetMock.mockRejectedValueOnce(new Error('backend unavailable'));

    await expect(persistFavoriteAssistantIds(['cowork'])).rejects.toThrow('backend unavailable');
    expect(configSetLocalMock).toHaveBeenCalledWith(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY, undefined);
  });
});

describe('useAssistantFavorites', () => {
  beforeEach(() => {
    configGetMock.mockReturnValue(undefined);
    configSetMock.mockResolvedValue(undefined);
  });

  it('returns an empty list and a persisting setter when nothing is stored', async () => {
    const { result } = renderHook(() => useAssistantFavorites());

    await waitFor(() => {
      expect(result.current.favoriteAssistantIds).toEqual([]);
    });

    await act(async () => {
      await result.current.setFavoriteAssistantIds(['writer']);
    });

    expect(configSetMock).toHaveBeenCalledWith(GUID_FAVORITE_ASSISTANTS_CONFIG_KEY, ['writer']);
  });

  it('normalizes a stored value with duplicates and whitespace', async () => {
    configGetMock.mockReturnValue([' writer ', 'cowork', 'writer']);
    const { result } = renderHook(() => useAssistantFavorites());

    await waitFor(() => {
      expect(result.current.favoriteAssistantIds).toEqual(['writer', 'cowork']);
    });
  });

  it('exposes a stable setter identity across renders', async () => {
    const { result, rerender } = renderHook(() => useAssistantFavorites());
    const firstSetter = result.current.setFavoriteAssistantIds;

    rerender();

    expect(result.current.setFavoriteAssistantIds).toBe(firstSetter);
  });
});
