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
export const STAR_OFFICE_URL_KEY = 'aionui.starOffice.url';
export const STAR_OFFICE_SYNC_ENABLED_KEY = 'aionui.starOffice.syncEnabled';
export const STAR_OFFICE_EMBED_ENABLED_KEY = 'aionui.starOffice.embedEnabled';
export const STAR_OFFICE_SYNC_LOGS_KEY = 'aionui.starOffice.syncLogs';



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
