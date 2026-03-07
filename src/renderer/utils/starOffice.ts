/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type StarOfficeState = 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error';
export type StarOfficeSource = 'acp' | 'openclaw-gateway';

export interface StarOfficeSyncResult {
  conversationId: string;
  source: StarOfficeSource;
  state: StarOfficeState;
  detail: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  ts: number;
}

export const DEFAULT_STAR_OFFICE_URL = 'http://127.0.0.1:19000';
export const STAR_OFFICE_FALLBACK_URLS = ['http://127.0.0.1:19000', 'http://127.0.0.1:18791'] as const;
export const STAR_OFFICE_URL_KEY = 'aionui.starOffice.url';
export const STAR_OFFICE_SYNC_ENABLED_KEY = 'aionui.starOffice.syncEnabled';
export const STAR_OFFICE_EMBED_ENABLED_KEY = 'aionui.starOffice.embedEnabled';
export const STAR_OFFICE_SYNC_LOGS_KEY = 'aionui.starOffice.syncLogs';
export const STAR_OFFICE_DETECT_CACHE_KEY = 'aionui.starOffice.detectCache.v2';
const STAR_OFFICE_STATUS_MARKERS = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'] as const;

const STAR_OFFICE_SCAN_RADIUS = 24;
const STAR_OFFICE_SCAN_CONCURRENCY = 6;
const STAR_OFFICE_SCAN_TIMEOUT_MS = 280;
const STAR_OFFICE_DETECT_CACHE_HIT_TTL_MS = 20_000;
const STAR_OFFICE_DETECT_CACHE_MISS_TTL_MS = 6_000;

interface DetectCacheEntry {
  url: string | null;
  ts: number;
}

interface DetectOptions {
  timeoutMs?: number;
  force?: boolean;
}

export const mapAcpAgentStatusToStarOfficeState = (status?: string): StarOfficeState | null => {
  switch (status) {
    case 'connecting':
    case 'connected':
    case 'authenticated':
      return 'syncing';
    case 'session_active':
      return 'idle';
    case 'error':
    case 'disconnected':
      return 'error';
    default:
      return null;
  }
};

export const toStarOfficeSetStateUrl = (baseUrl: string): string => {
  const normalizedBase = (baseUrl || DEFAULT_STAR_OFFICE_URL).trim().replace(/\/+$/, '');
  return `${normalizedBase}/set_state`;
};

export const readStarOfficeUrl = () => {
  try {
    return localStorage.getItem(STAR_OFFICE_URL_KEY)?.trim() || DEFAULT_STAR_OFFICE_URL;
  } catch {
    return DEFAULT_STAR_OFFICE_URL;
  }
};

export const readStarOfficeBool = (key: string, defaultValue: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return defaultValue;
    return raw === 'true';
  } catch {
    return defaultValue;
  }
};

export const appendStarOfficeSyncLog = (entry: StarOfficeSyncResult) => {
  try {
    const currentRaw = localStorage.getItem(STAR_OFFICE_SYNC_LOGS_KEY);
    const current = currentRaw ? (JSON.parse(currentRaw) as StarOfficeSyncResult[]) : [];
    const next = [entry, ...current].slice(0, 20);
    localStorage.setItem(STAR_OFFICE_SYNC_LOGS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
};

export const readStarOfficeSyncLogs = (): StarOfficeSyncResult[] => {
  try {
    const raw = localStorage.getItem(STAR_OFFICE_SYNC_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StarOfficeSyncResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const fetchStarOfficeText = async (targetUrl: string, timeoutMs: number): Promise<{ ok: boolean; contentType: string; text: string }> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
      },
    });
    return {
      ok: response.ok,
      contentType: response.headers.get('content-type') || '',
      text: await response.text(),
    };
  } catch {
    return { ok: false, contentType: '', text: '' };
  } finally {
    window.clearTimeout(timer);
  }
};

export const checkStarOfficeHealth = async (baseUrl: string, timeoutMs = 1200): Promise<boolean> => {
  const normalizedBase = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return false;

  const health = await fetchStarOfficeText(`${normalizedBase}/health`, timeoutMs);
  if (!health.ok) return false;

  const status = await fetchStarOfficeText(`${normalizedBase}/status`, timeoutMs);
  if (status.ok) {
    const normalizedStatus = status.text.toLowerCase();
    const isHtml = status.contentType.toLowerCase().includes('text/html');
    const hasStarOfficeState = STAR_OFFICE_STATUS_MARKERS.some((marker) => normalizedStatus.includes(marker));
    if (!isHtml && hasStarOfficeState) {
      return true;
    }
  }

  const root = await fetchStarOfficeText(normalizedBase, timeoutMs);
  if (!root.ok) return false;
  const normalizedRoot = root.text.toLowerCase();
  if (normalizedRoot.includes('openclaw control')) {
    return false;
  }

  return normalizedRoot.includes('star office')
    || normalizedRoot.includes('decorate room')
    || normalizedRoot.includes('asset sidebar');
};

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

const readDetectCache = (): DetectCacheEntry | null => {
  try {
    const raw = localStorage.getItem(STAR_OFFICE_DETECT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DetectCacheEntry;
    if (!parsed || typeof parsed.ts !== 'number' || !('url' in parsed)) return null;
    if (parsed.url !== null && typeof parsed.url !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeDetectCache = (url: string | null) => {
  try {
    localStorage.setItem(
      STAR_OFFICE_DETECT_CACHE_KEY,
      JSON.stringify({
        url,
        ts: Date.now(),
      } as DetectCacheEntry)
    );
  } catch {
    // ignore storage failures
  }
};

const buildCandidates = (preferredUrl?: string): string[] => {
  const knownPorts = [toLocalPort(preferredUrl), ...STAR_OFFICE_FALLBACK_URLS.map((item) => toLocalPort(item))]
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

  return [...knownPorts, ...rangedPorts]
    .filter((port, index, arr) => arr.indexOf(port) === index)
    .map(toLocalUrl);
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
      const ok = await checkStarOfficeHealth(target, timeoutMs);
      if (ok && !found) {
        found = target;
        return;
      }
    }
  });

  await Promise.all(workers);
  return found;
};

export const detectReachableStarOfficeUrl = async (preferredUrl?: string, options: DetectOptions = {}): Promise<string | null> => {
  const timeoutMs = options.timeoutMs ?? STAR_OFFICE_SCAN_TIMEOUT_MS;

  if (!options.force) {
    const cache = readDetectCache();
    if (cache) {
      const ttl = cache.url ? STAR_OFFICE_DETECT_CACHE_HIT_TTL_MS : STAR_OFFICE_DETECT_CACHE_MISS_TTL_MS;
      if (Date.now() - cache.ts <= ttl) {
        return cache.url;
      }
    }
  }

  const candidates = buildCandidates(preferredUrl);
  const found = await probeCandidates(candidates, timeoutMs);
  writeDetectCache(found);
  return found;
};
