/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

const STAR_OFFICE_SCAN_RADIUS = 24;
const STAR_OFFICE_SCAN_CONCURRENCY = 6;
const STAR_OFFICE_STATUS_MARKERS = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];
const STAR_OFFICE_DETECT_CACHE_HIT_TTL_MS = 20_000;
const STAR_OFFICE_DETECT_CACHE_MISS_TTL_MS = 1_500;

let detectCache: { url: string | null; ts: number } | null = null;

const toLocalPort = (rawUrl?: string): number | null => {
  if (!rawUrl?.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (!['127.0.0.1', 'localhost'].includes(host)) return null;
    if (parsed.port) {
      const port = Number(parsed.port);
      return Number.isFinite(port) && port > 0 ? port : null;
    }
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return null;
  }
};

const toLocalUrl = (port: number) => `http://127.0.0.1:${port}`;

const buildCandidates = (preferredUrl?: string): string[] => {
  const knownPorts = [toLocalPort(preferredUrl), 19000, 18791]
    .filter((port): port is number => port != null)
    .filter((port, index, arr) => arr.indexOf(port) === index);

  const rangedPorts: number[] = [];
  for (const basePort of knownPorts) {
    for (let offset = 1; offset <= STAR_OFFICE_SCAN_RADIUS; offset += 1) {
      const up = basePort + offset;
      const down = basePort - offset;
      if (up <= 65535) rangedPorts.push(up);
      if (down >= 1024) rangedPorts.push(down);
    }
  }

  return [...knownPorts, ...rangedPorts].filter((port, index, arr) => arr.indexOf(port) === index).map(toLocalUrl);
};

const fetchText = async (
  targetUrl: string,
  timeoutMs: number
): Promise<{ ok: boolean; contentType: string; text: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/html;q=0.9, */*;q=0.8' },
    });
    return {
      ok: response.ok,
      contentType: response.headers.get('content-type') || '',
      text: await response.text(),
    };
  } catch {
    return { ok: false, contentType: '', text: '' };
  } finally {
    clearTimeout(timer);
  }
};

const checkHealth = async (baseUrl: string, timeoutMs = 1000): Promise<boolean> => {
  const normalizedBase = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return false;

  const health = await fetchText(`${normalizedBase}/health`, timeoutMs);
  if (!health.ok) return false;

  const status = await fetchText(`${normalizedBase}/status`, timeoutMs);
  if (status.ok) {
    const normalizedStatus = status.text.toLowerCase();
    const isHtml = status.contentType.toLowerCase().includes('text/html');
    const hasStarOfficeState = STAR_OFFICE_STATUS_MARKERS.some((marker) => normalizedStatus.includes(marker));
    if (!isHtml && hasStarOfficeState) return true;
  }

  const root = await fetchText(normalizedBase, timeoutMs);
  if (!root.ok) return false;
  const normalizedRoot = root.text.toLowerCase();
  if (normalizedRoot.includes('openclaw control')) return false;

  return (
    normalizedRoot.includes('star office') ||
    normalizedRoot.includes('decorate room') ||
    normalizedRoot.includes('asset sidebar')
  );
};

const probeCandidates = async (candidates: string[], timeoutMs: number): Promise<string | null> => {
  if (!candidates.length) return null;

  let cursor = 0;
  let found: string | null = null;
  const workers = Array.from({ length: Math.min(STAR_OFFICE_SCAN_CONCURRENCY, candidates.length) }, async () => {
    while (!found) {
      const current = cursor;
      cursor += 1;
      if (current >= candidates.length) return;
      const target = candidates[current];
      // eslint-disable-next-line no-await-in-loop
      const ok = await checkHealth(target, timeoutMs);
      if (ok && !found) {
        found = target;
      }
    }
  });

  await Promise.all(workers);
  return found;
};

const detectUrl = async (preferredUrl?: string, timeoutMs = 1000, force = false): Promise<string | null> => {
  if (!force && detectCache) {
    const ttl = detectCache.url ? STAR_OFFICE_DETECT_CACHE_HIT_TTL_MS : STAR_OFFICE_DETECT_CACHE_MISS_TTL_MS;
    if (Date.now() - detectCache.ts <= ttl) {
      return detectCache.url;
    }
  }

  const candidates = buildCandidates(preferredUrl);
  const found = await probeCandidates(candidates, timeoutMs);
  detectCache = { url: found, ts: Date.now() };
  return found;
};

export function initStarOfficeBridge(): void {
  ipcBridge.starOffice.detectUrl.provider(async ({ preferredUrl, force, timeoutMs }) => {
    try {
      const url = await detectUrl(preferredUrl, timeoutMs ?? 1000, force ?? false);
      return { success: true, data: { url } };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });
}
