/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshSession, refreshSessionOutcome, resetSessionRefresh } from '@/common/adapter/sessionRefresh';

type WindowWithPort = { __backendPort?: number };

describe('refreshSession (WebUI session refresh)', () => {
  beforeEach(() => {
    // Browser mode: real DOM (jsdom) with no Electron preload port.
    delete (window as WindowWithPort).__backendPort;
    // The expiry latch and the retry cooldown are module-level state; clear them
    // so tests do not inherit a previous test's verdict.
    resetSessionRefresh();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSessionRefresh();
    delete (window as WindowWithPort).__backendPort;
  });

  it('POSTs /api/auth/refresh (cookie-borne, no body) and resolves true on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSession()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/refresh');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    // No body — the browser attaches the HttpOnly refresh cookie.
    expect(init.body).toBeUndefined();
  });

  it('sends no x-csrf-token header (open-source WebUI has no CSRF layer — M6 removed, M7 restores)', async () => {
    // resolveCoreCsrfToken() is a stub returning '' here, so the shared refresh
    // primitive attaches no CSRF header. The aionpro superset resolves a real
    // token and asserts the header is present instead.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSession()).resolves.toBe(true);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers ?? {}).not.toHaveProperty('x-csrf-token');
  });

  it('resolves false when the refresh token is also expired (non-ok response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(refreshSession()).resolves.toBe(false);
  });

  it('resolves false (never throws) on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(refreshSession()).resolves.toBe(false);
  });

  it('single-flights concurrent callers into one POST, then refreshes anew afterwards', async () => {
    let resolveFetch: (value: { ok: boolean }) => void = () => {};
    const pending = new Promise<{ ok: boolean }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const first = refreshSession();
    const second = refreshSession();
    // Both callers share the same in-flight request.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);

    // In-flight promise cleared after settling — a later call refreshes again.
    await expect(refreshSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is a no-op (no fetch) outside WebUI browser mode', async () => {
    (window as WindowWithPort).__backendPort = 13400;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSession()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('latches on 401 so repeated failures cost exactly one POST (#4155)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSessionOutcome()).resolves.toBe('expired');

    // A dead refresh credential cannot become alive again. Every later 401 in the
    // app must be answered from the latch, not with another POST — otherwise a
    // revalidation burst turns into a storm against a rate-limited endpoint.
    const repeats = await Promise.all(Array.from({ length: 20 }, () => refreshSessionOutcome()));
    expect(repeats.every((outcome) => outcome === 'expired')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats an inconclusive failure as retryable, not as a dead session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(refreshSessionOutcome()).resolves.toBe('unavailable');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    resetSessionRefresh();
    await expect(refreshSessionOutcome()).resolves.toBe('unavailable');
  });

  it('backs off between inconclusive attempts instead of retrying on every 401', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal('fetch', fetchMock);

      await expect(refreshSessionOutcome()).resolves.toBe('unavailable');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Inside the cooldown the answer comes back without touching the network.
      await expect(refreshSessionOutcome()).resolves.toBe('unavailable');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Once it elapses the session gets another chance — this must not latch.
      vi.setSystemTime(Date.now() + 1_001);
      await expect(refreshSessionOutcome()).resolves.toBe('unavailable');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes refreshing after resetSessionRefresh() (re-auth)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSessionOutcome()).resolves.toBe('expired');
    await expect(refreshSessionOutcome()).resolves.toBe('expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetSessionRefresh();
    await expect(refreshSessionOutcome()).resolves.toBe('refreshed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears a previous cooldown once a refresh succeeds', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      await expect(refreshSessionOutcome()).resolves.toBe('unavailable');
      vi.setSystemTime(Date.now() + 1_001);
      await expect(refreshSessionOutcome()).resolves.toBe('refreshed');

      // Back to the 1s floor: a later failure must not inherit the grown delay.
      await expect(refreshSessionOutcome()).resolves.toBe('refreshed');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
