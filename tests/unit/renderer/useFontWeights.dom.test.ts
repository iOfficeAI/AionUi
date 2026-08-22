import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Subscriber-registry mock mirroring configService: set() writes the store then
// synchronously notifies subscribers for that key (as the real service does
// before its await), so the hook's subscription is the single update path.
const store: Map<string, unknown> = new Map();
const subscribers: Map<string, Set<(value: unknown) => void>> = new Map();

vi.mock('@/common/config/configService', () => {
  const whenReady = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    configService: {
      whenReady,
      get: (k: string) => store.get(k),
      set: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
        subscribers.get(k)?.forEach((cb) => cb(v));
      }),
      subscribe: (k: string, cb: (value: unknown) => void) => {
        if (!subscribers.has(k)) {
          subscribers.set(k, new Set());
        }
        subscribers.get(k)!.add(cb);
        return () => {
          subscribers.get(k)?.delete(cb);
        };
      },
    },
  };
});

import { useFontWeights } from '@renderer/hooks/ui/font/useFontWeights';
import { configService } from '@/common/config/configService';

describe('useFontWeights', () => {
  beforeEach(() => {
    store.clear();
    subscribers.clear();
    document.documentElement.removeAttribute('style');
    vi.clearAllMocks();
  });

  it('defaults to no override and writes no font-weight variable', async () => {
    const { result } = renderHook(() => useFontWeights());
    await waitFor(() => expect(result.current.fontWeights.chat).toBe(''));
    expect(document.documentElement.style.getPropertyValue('--chat-font-weight')).toBe('');
  });

  it('loads a persisted weight and applies its CSS variable', async () => {
    store.set('ui.fontWeight.code', '700');
    const { result } = renderHook(() => useFontWeights());
    await waitFor(() => expect(result.current.fontWeights.code).toBe('700'));
    expect(document.documentElement.style.getPropertyValue('--code-font-weight')).toBe('700');
  });

  it('persists a sanitized weight and updates the CSS variable on setFontWeight', async () => {
    const { result } = renderHook(() => useFontWeights());
    await waitFor(() => expect(result.current.fontWeights.chat).toBe(''));
    await act(async () => {
      await result.current.setFontWeight('chat', '  600  ');
    });
    expect(configService.set).toHaveBeenCalledWith('ui.fontWeight.chat', '600');
    await waitFor(() => expect(result.current.fontWeights.chat).toBe('600'));
    expect(document.documentElement.style.getPropertyValue('--chat-font-weight')).toBe('600');
  });

  it('clearing back to the system default removes the CSS variable', async () => {
    store.set('ui.fontWeight.markdown', '500');
    const { result } = renderHook(() => useFontWeights());
    await waitFor(() => expect(result.current.fontWeights.markdown).toBe('500'));
    await act(async () => {
      await result.current.setFontWeight('markdown', '');
    });
    await waitFor(() => expect(result.current.fontWeights.markdown).toBe(''));
    expect(document.documentElement.style.getPropertyValue('--md-font-weight')).toBe('');
  });

  it('rejects an unknown weight, persisting the no-override sentinel', async () => {
    const { result } = renderHook(() => useFontWeights());
    await waitFor(() => expect(result.current.fontWeights.app).toBe(''));
    await act(async () => {
      await result.current.setFontWeight('app', '999');
    });
    expect(configService.set).toHaveBeenCalledWith('ui.fontWeight.app', '');
    expect(document.documentElement.style.getPropertyValue('--app-font-weight')).toBe('');
  });
});
