/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sidecar hook — Phase 3 WS3.
 *
 * Reads the persisted `sidecars.items` config, on demand calls
 * `POST /api/sidecars` to obtain a one-shot token, caches the resulting
 * `SidecarRegistration` in memory, and composes an embeddable URL the
 * WebviewHost can load inside the settings modal.
 *
 * The token is intentionally NOT persisted — the next renderer restart
 * will re-register and receive a fresh one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import type { SidecarConfig, SidecarRegistration } from '@/common/types/sidecarTypes';

/** In-memory token cache keyed by `${name}|${port}`. Tokens are single-use
 *  and the proxy sets a cookie after the first navigation, so callers MUST
 *  re-register if a previous attempt was aborted before reaching the
 *  backend (e.g. user closed the modal before the webview loaded). */
type RegistrationCache = Map<string, SidecarRegistration>;

const cacheKey = (config: Pick<SidecarConfig, 'name' | 'port'>): string => `${config.name}|${config.port}`;

const readItems = (): SidecarConfig[] => {
  const stored = configService.get('sidecars.items');
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (entry): entry is SidecarConfig =>
      !!entry && typeof entry === 'object' && typeof entry.name === 'string' && Number.isFinite(entry.port)
  );
};

/**
 * Resolve the backend origin the renderer should talk to. Mirrors
 * `getBaseUrl()` in `httpBridge` but is renderer-side and sidecar-scoped.
 */
const resolveBackendOrigin = (): string => {
  if (typeof window !== 'undefined' && (window as Window).__backendPort) {
    return `http://127.0.0.1:${(window as Window).__backendPort}`;
  }
  return 'http://127.0.0.1:13400';
};

/**
 * Compose the full URL a `<webview src=...>` should navigate to. The token
 * rides the query string on the first navigation; the backend proxy
 * exchanges it for a session cookie that subsequent navigations use.
 */
export const buildEmbedUrl = (registration: SidecarRegistration, backendPort?: number): string => {
  // `backendPort` is exposed for tests; production callers rely on the
  // window-injected `__backendPort` value via `resolveBackendOrigin`.
  const port = backendPort ?? Number((typeof window !== 'undefined' && (window as Window).__backendPort) || 13400);
  // Trim any trailing slash on `url` so we don't double up the path.
  const base = `http://127.0.0.1:${port}`;
  const path = registration.url.endsWith('/') ? registration.url : `${registration.url}/`;
  return `${base}${path}?sct=${encodeURIComponent(registration.token)}`;
};

export type UseSidecarsResult = {
  /** Persisted sidecar entries (mirrors `sidecars.items`). */
  items: SidecarConfig[];
  /** True while the initial config read is in flight. */
  loading: boolean;
  /** Persist a new entry. Backend registration happens lazily on Open. */
  add: (config: SidecarConfig) => Promise<void>;
  /** Remove an entry. Calls `DELETE /api/sidecars/{id}` when `id` is known. */
  remove: (config: SidecarConfig) => Promise<void>;
  /**
   * Register (or reuse cached) and return a registration the caller can
   * pass to {@link buildEmbedUrl}. Caches the token in memory only.
   */
  ensureRegistered: (config: SidecarConfig) => Promise<SidecarRegistration>;
  /**
   * Convenience: build a full embed URL for a sidecar, registering
   * first if no cached token exists.
   */
  resolveEmbedUrl: (config: SidecarConfig) => Promise<string>;
};

export const useSidecars = (): UseSidecarsResult => {
  const [items, setItems] = useState<SidecarConfig[]>(() => readItems());
  // `loading` is exposed on the hook result for future callers; the
  // current settings page is synchronous-friendly so we don't actually
  // need to write to it yet. Keep it reserved instead of dropping the
  // contract.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading] = useState(false);
  const cacheRef = useRef<RegistrationCache>(new Map());

  // Re-read on mount in case configService was populated after initial
  // state read, and subscribe to live changes.
  useEffect(() => {
    setItems(readItems());
    try {
      return configService.subscribe('sidecars.items', (value) => {
        if (Array.isArray(value)) {
          setItems(
            value.filter(
              (entry): entry is SidecarConfig =>
                !!entry && typeof entry === 'object' && typeof entry.name === 'string' && Number.isFinite(entry.port)
            )
          );
        } else {
          setItems([]);
        }
      });
    } catch {
      return undefined;
    }
  }, []);

  const add = useCallback(async (config: SidecarConfig) => {
    const current = readItems();
    const merged = [...current.filter((c) => c.name !== config.name), config];
    await configService.set('sidecars.items', merged);
  }, []);

  const remove = useCallback(async (config: SidecarConfig) => {
    const current = readItems();
    const next = current.filter((c) => c.name !== config.name);
    await configService.set('sidecars.items', next);
    cacheRef.current.delete(cacheKey(config));
    if (config.id) {
      try {
        await ipcBridge.sidecar.remove.invoke({ id: config.id });
      } catch (error) {
        // Backend removal is best-effort: the local entry is already
        // gone, the backend will GC the orphan on its own next pass.
        console.warn('[useSidecars] backend remove failed:', error);
      }
    }
  }, []);

  const ensureRegistered = useCallback(async (config: SidecarConfig): Promise<SidecarRegistration> => {
    const key = cacheKey(config);
    const cached = cacheRef.current.get(key);
    if (cached) return cached;
    const reg = await ipcBridge.sidecar.register.invoke({ name: config.name, port: config.port });
    cacheRef.current.set(key, reg);
    // Persist the backend-assigned id so future remove() calls work.
    if (reg.id && reg.id !== config.id) {
      const current = readItems();
      // oxlint no-map-spread: a single object clone is fine for our
      // small persisted config; the rule is a perf hint, not a
      // correctness one.
      const updated = current.map((c) => {
        if (c.name !== config.name) return c;
        return { ...c, id: reg.id };
      });
      try {
        await configService.set('sidecars.items', updated);
      } catch (error) {
        console.warn('[useSidecars] failed to persist assigned id:', error);
      }
    }
    return reg;
  }, []);

  const resolveEmbedUrl = useCallback(
    async (config: SidecarConfig) => {
      const reg = await ensureRegistered(config);
      return buildEmbedUrl(reg);
    },
    [ensureRegistered]
  );

  return useMemo(
    () => ({ items, loading, add, remove, ensureRegistered, resolveEmbedUrl }),
    [items, loading, add, remove, ensureRegistered, resolveEmbedUrl]
  );
};

/** Pure backend-origin resolver exported for tests / debugging. */
export const getBackendOrigin = resolveBackendOrigin;
