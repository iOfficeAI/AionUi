/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for the WebUI server-side file picker. Kept free of React/Arco
 * imports so they can be unit-tested without a DOM.
 */

import type { ShowOpenOptions } from '@/common/adapter/ipcBridge';

export type PickerEntry = {
  name: string;
  fullPath: string;
  isDir: boolean;
};

/**
 * `/api/fs/dir` answers in snake_case (`full_path`, `is_dir`) while the shared
 * `IDirOrFile` type declares camelCase and `httpPost` does no key conversion,
 * so accept either shape rather than trusting one of them.
 */
export const normalizeEntry = (raw: unknown): PickerEntry | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const fullPath = (item.fullPath ?? item.full_path) as string | undefined;
  const name = item.name as string | undefined;
  if (!fullPath || !name) return null;
  const isDir = Boolean(item.isDir ?? item.is_dir);
  return { name, fullPath, isDir };
};

/** Directories first, then case-insensitive by name — mirrors native pickers. */
export const sortEntries = (entries: PickerEntry[]): PickerEntry[] =>
  entries.toSorted((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

/** POSIX parent directory, clamped at the filesystem root. */
export const parentOf = (dir: string): string => {
  if (!dir || dir === '/') return '/';
  const trimmed = dir.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return trimmed.slice(0, idx);
};

/**
 * Electron's `filters` are advisory; treat an empty/`*` extension list as
 * "show everything" so a filtered picker never hides all candidates.
 */
export const matchesFilters = (name: string, filters: NonNullable<ShowOpenOptions>['filters']): boolean => {
  if (!filters || filters.length === 0) return true;
  const exts = filters.flatMap((f) => f.extensions ?? []).filter((e) => e && e !== '*');
  if (exts.length === 0) return true;
  const lower = name.toLowerCase();
  return exts.some((ext) => lower.endsWith(`.${ext.toLowerCase()}`));
};
