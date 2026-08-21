import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// useSystemFonts caches results at module scope for the whole session. Reset the
// module registry before each test so cachedFonts/inflight start clean, then
// dynamically import BOTH the hook and @testing-library/react inside each test —
// this way renderHook and the hook share one freshly-loaded React instance
// (a static import would bind renderHook to a pre-reset React and trigger an
// "invalid hook call").

type FontRecord = { family: string };

const setQueryLocalFonts = (impl: (() => Promise<FontRecord[]>) | undefined): void => {
  Object.defineProperty(window, 'queryLocalFonts', { configurable: true, writable: true, value: impl });
};

const importHook = async () => (await import('@renderer/hooks/ui/font/useSystemFonts')).useSystemFonts;
const importRtl = async () => await import('@testing-library/react');

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'queryLocalFonts');
});

describe('useSystemFonts', () => {
  it('starts idle and does not query until load() is called', async () => {
    const query = vi.fn(async () => [{ family: 'Inter' }]);
    setQueryLocalFonts(query);
    const { renderHook } = await importRtl();
    const useSystemFonts = await importHook();
    const { result } = renderHook(() => useSystemFonts());
    expect(result.current.status).toBe('idle');
    expect(result.current.fonts).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('dedupes family names across style records and sorts case-insensitively', async () => {
    const query = vi.fn(async () => [
      { family: 'Roboto' },
      { family: 'Roboto' },
      { family: 'inter' },
      { family: 'Arial' },
      { family: '  ' },
    ]);
    setQueryLocalFonts(query);
    const { renderHook, act, waitFor } = await importRtl();
    const useSystemFonts = await importHook();
    const { result } = renderHook(() => useSystemFonts());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.fonts).toEqual(['Arial', 'inter', 'Roboto']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('serves later hooks from the session cache without re-querying', async () => {
    const query = vi.fn(async () => [{ family: 'Inter' }]);
    setQueryLocalFonts(query);
    const { renderHook, act, waitFor } = await importRtl();
    const useSystemFonts = await importHook();
    const first = renderHook(() => useSystemFonts());
    act(() => first.result.current.load());
    await waitFor(() => expect(first.result.current.status).toBe('ready'));

    // A second hook instance sees the cache immediately (ready, populated).
    const second = renderHook(() => useSystemFonts());
    expect(second.result.current.status).toBe('ready');
    expect(second.result.current.fonts).toEqual(['Inter']);
    act(() => second.result.current.load());
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports error and allows a later gesture to retry when the query rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const query = vi.fn(async () => {
      throw new Error('permission denied');
    });
    setQueryLocalFonts(query);
    const { renderHook, act, waitFor } = await importRtl();
    const useSystemFonts = await importHook();
    const { result } = renderHook(() => useSystemFonts());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.status).toBe('error'));
    // inflight was reset on failure, so a subsequent load() re-queries.
    act(() => result.current.load());
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    errorSpy.mockRestore();
  });

  it('returns an empty list when the Local Font Access API is unavailable', async () => {
    // queryLocalFonts intentionally left undefined (cleared by afterEach).
    const { renderHook, act, waitFor } = await importRtl();
    const useSystemFonts = await importHook();
    const { result } = renderHook(() => useSystemFonts());
    act(() => result.current.load());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.fonts).toEqual([]);
  });
});
