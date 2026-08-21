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

import { useFontFamilies } from '@renderer/hooks/ui/font/useFontFamilies';
import { configService } from '@/common/config/configService';

describe('useFontFamilies', () => {
  beforeEach(() => {
    store.clear();
    subscribers.clear();
    document.documentElement.removeAttribute('style');
    vi.clearAllMocks();
  });

  it('defaults to no override and writes no font-family variable', async () => {
    const { result } = renderHook(() => useFontFamilies());
    await waitFor(() => expect(result.current.fontFamilies.chat).toBe(''));
    expect(document.documentElement.style.getPropertyValue('--chat-font-family')).toBe('');
  });

  it('loads a persisted family and applies its CSS variable', async () => {
    store.set('ui.fontFamily.code', 'Fira Code');
    const { result } = renderHook(() => useFontFamilies());
    await waitFor(() => expect(result.current.fontFamilies.code).toBe('Fira Code'));
    expect(document.documentElement.style.getPropertyValue('--code-font-family')).toBe('"Fira Code", monospace');
  });

  it('persists a sanitized family and updates the CSS variable on setFontFamily', async () => {
    const { result } = renderHook(() => useFontFamilies());
    await waitFor(() => expect(result.current.fontFamilies.chat).toBe(''));
    await act(async () => {
      await result.current.setFontFamily('chat', '  Inter  ');
    });
    expect(configService.set).toHaveBeenCalledWith('ui.fontFamily.chat', 'Inter');
    await waitFor(() => expect(result.current.fontFamilies.chat).toBe('Inter'));
    expect(document.documentElement.style.getPropertyValue('--chat-font-family')).toBe('"Inter", sans-serif');
  });

  it('clearing back to the system default removes the CSS variable', async () => {
    store.set('ui.fontFamily.markdown', 'Lora');
    const { result } = renderHook(() => useFontFamilies());
    await waitFor(() => expect(result.current.fontFamilies.markdown).toBe('Lora'));
    await act(async () => {
      await result.current.setFontFamily('markdown', '');
    });
    await waitFor(() => expect(result.current.fontFamilies.markdown).toBe(''));
    expect(document.documentElement.style.getPropertyValue('--md-font-family')).toBe('');
  });
});
