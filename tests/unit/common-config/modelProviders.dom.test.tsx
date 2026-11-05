import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import type { IProvider } from '@/common/config/storage';

const { listProviders } = vi.hoisted(() => ({ listProviders: vi.fn() }));
vi.mock('@/common', () => ({ ipcBridge: { mode: { listProviders: { invoke: listProviders } } } }));
vi.mock('@/renderer/hooks/agent/useGoogleAuthModels', () => ({ useGoogleAuthModels: () => ({ isGoogleAuth: false }) }));
import { fetchProviders, useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';

const providers: IProvider[] = [
  { id: 'test', platform: 'openai', name: 'Saved provider', api_key: '', base_url: '', models: ['test-model'] },
];
function wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

describe('provider query recovery', () => {
  beforeEach(() => {
    listProviders.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('recovers a failed initial request without remounting or editing saved providers', async () => {
    vi.useFakeTimers();
    listProviders.mockRejectedValueOnce(new Error('backend unavailable')).mockResolvedValue(providers);
    const { result } = renderHook(() => ({ ...useProvidersQuery() }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.error?.message).toBe('backend unavailable');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(result.current.data).toEqual(providers);
    expect(result.current.error).toBeUndefined();
  });

  it('bounds automatic retries when the backend remains unavailable', async () => {
    vi.useFakeTimers();
    listProviders.mockRejectedValue(new Error('backend unavailable'));
    const { result } = renderHook(() => ({ ...useProvidersQuery() }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000);
    });
    expect(listProviders).toHaveBeenCalledTimes(4);
    expect(result.current.error?.message).toBe('backend unavailable');
  });

  it('keeps previously loaded providers visible when revalidation fails', async () => {
    listProviders.mockResolvedValueOnce(providers).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => ({ ...useProvidersQuery() }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(providers));
    await act(async () => {
      await result.current.mutate().catch(() => {});
    });
    expect(result.current.data).toEqual(providers);
    expect(result.current.error?.message).toBe('offline');
  });

  it('does not convert a missing backend response into an empty successful list', async () => {
    listProviders.mockResolvedValue(undefined);
    await expect(fetchProviders()).rejects.toThrow('Invalid provider list response');
    listProviders.mockResolvedValue([]);
    await expect(fetchProviders()).resolves.toEqual([]);
  });
});
