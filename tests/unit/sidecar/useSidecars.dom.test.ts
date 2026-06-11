/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/useSidecars.ts (Phase 3 WS3).
 *
 * Covers:
 * - `buildEmbedUrl` composes the proxy URL with the encoded token
 * - `useSidecars` `add` / `remove` update persisted config
 * - `ensureRegistered` caches the token in memory
 * - `resolveEmbedUrl` returns the full embed URL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/common', () => ({
  ipcBridge: {
    sidecar: {
      list: { invoke: vi.fn() },
      register: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/config/configService', () => {
  const subs = new Map<string, Set<(value: unknown) => void>>();
  let store: Record<string, unknown> = {};
  return {
    configService: {
      get: vi.fn((key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store = { ...store, [key]: value };
        for (const cb of subs.get(key) ?? []) cb(value);
      }),
      subscribe: vi.fn((key: string, cb: (value: unknown) => void) => {
        if (!subs.has(key)) subs.set(key, new Set());
        subs.get(key)!.add(cb);
        return () => subs.get(key)?.delete(cb);
      }),
      __reset: () => {
        store = {};
        subs.clear();
      },
      __set: (key: string, value: unknown) => {
        store = { ...store, [key]: value };
      },
    },
  };
});

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { buildEmbedUrl, useSidecars } from '@/renderer/hooks/useSidecars';
import type { SidecarConfig, SidecarRegistration } from '@/common/types/sidecarTypes';

const mockRegister = ipcBridge.sidecar.register.invoke as unknown as ReturnType<typeof vi.fn>;
const mockRemove = ipcBridge.sidecar.remove.invoke as unknown as ReturnType<typeof vi.fn>;
const mockSet = configService.set as unknown as ReturnType<typeof vi.fn>;

const regResponse: SidecarRegistration = {
  id: 'sc-123',
  name: 'ttyd',
  port: 7681,
  url: '/sidecar/sc-123/',
  token: 'tok-abc',
};

const ttydConfig: SidecarConfig = { name: 'ttyd', port: 7681 };

describe('buildEmbedUrl', () => {
  it('composes the proxy URL with encoded token and a trailing slash', () => {
    const url = buildEmbedUrl(regResponse, 12345);
    expect(url).toBe('http://127.0.0.1:12345/sidecar/sc-123/?sct=tok-abc');
  });

  it('handles `url` without a trailing slash', () => {
    const url = buildEmbedUrl({ ...regResponse, url: '/sidecar/sc-123' }, 12345);
    expect(url).toBe('http://127.0.0.1:12345/sidecar/sc-123/?sct=tok-abc');
  });

  it('encodes special characters in the token', () => {
    const url = buildEmbedUrl({ ...regResponse, token: 'tok/with space+&' }, 9999);
    expect(url).toBe('http://127.0.0.1:9999/sidecar/sc-123/?sct=tok%2Fwith%20space%2B%26');
  });
});

describe('useSidecars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (configService as unknown as { __reset: () => void }).__reset();
  });

  it('exposes an empty list when config has no items', () => {
    const { result } = renderHook(() => useSidecars());
    expect(result.current.items).toEqual([]);
  });

  it('add() persists the new entry under sidecars.items', async () => {
    const { result } = renderHook(() => useSidecars());

    await act(async () => {
      await result.current.add(ttydConfig);
    });

    expect(mockSet).toHaveBeenCalledWith('sidecars.items', [ttydConfig]);
    // The hook re-reads the value from the mock store on next render.
    await waitFor(() => expect(result.current.items).toEqual([ttydConfig]));
  });

  it('add() replaces a previous entry with the same name', async () => {
    const { result } = renderHook(() => useSidecars());

    await act(async () => {
      await result.current.add({ name: 'ttyd', port: 7000 });
    });
    await act(async () => {
      await result.current.add({ name: 'ttyd', port: 7681 });
    });

    expect(mockSet).toHaveBeenLastCalledWith('sidecars.items', [ttydConfig]);
    await waitFor(() => expect(result.current.items).toEqual([ttydConfig]));
  });

  it('remove() drops the entry and clears the cached token', async () => {
    // Seed the mock store with one item and pre-populate the token cache
    // by triggering a registration first.
    mockRegister.mockResolvedValue(regResponse);
    mockRemove.mockResolvedValue(undefined);

    (configService as unknown as { __set: (k: string, v: unknown) => void }).__set('sidecars.items', [ttydConfig]);
    const { result } = renderHook(() => useSidecars());

    // Wait for the seeded item to show up.
    await waitFor(() => expect(result.current.items).toEqual([ttydConfig]));

    // Populate the in-memory token cache.
    await act(async () => {
      await result.current.ensureRegistered(ttydConfig);
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Now remove — the cache should be cleared and a second ensureRegistered
    // call should re-hit the backend.
    await act(async () => {
      await result.current.remove({ ...ttydConfig, id: 'sc-123' });
    });

    expect(mockRemove).toHaveBeenCalledWith({ id: 'sc-123' });
    expect(mockSet).toHaveBeenLastCalledWith('sidecars.items', []);
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.ensureRegistered(ttydConfig);
    });
    // The second call must go to the backend (token was wiped on remove).
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it('ensureRegistered caches the registration by name+port and persists the assigned id', async () => {
    mockRegister.mockResolvedValue(regResponse);
    (configService as unknown as { __set: (k: string, v: unknown) => void }).__set('sidecars.items', [ttydConfig]);
    const { result } = renderHook(() => useSidecars());
    await waitFor(() => expect(result.current.items).toEqual([ttydConfig]));

    await act(async () => {
      await result.current.ensureRegistered(ttydConfig);
    });
    await act(async () => {
      await result.current.ensureRegistered(ttydConfig);
    });

    // Only one backend call — the second hit the cache.
    expect(mockRegister).toHaveBeenCalledTimes(1);
    // The assigned id should be persisted back to the config.
    expect(mockSet).toHaveBeenCalledWith('sidecars.items', [{ ...ttydConfig, id: 'sc-123' }]);
  });

  it('resolveEmbedUrl returns the composed embed URL', async () => {
    mockRegister.mockResolvedValue(regResponse);
    const { result } = renderHook(() => useSidecars());

    let url = '';
    await act(async () => {
      url = await result.current.resolveEmbedUrl(ttydConfig);
    });

    // Uses the `window.__backendPort` injection; in jsdom we have to
    // assume the default fallback (13400) unless the test sets the global.
    expect(url).toContain('sct=tok-abc');
    expect(url).toContain('/sidecar/sc-123/');
  });
});
