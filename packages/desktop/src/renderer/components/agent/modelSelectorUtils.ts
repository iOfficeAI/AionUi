/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModelSelectorOptionBase = {
  key: string;
  id: string;
  label: string;
  providerId?: string;
  providerName?: string;
  searchText?: string;
};

export type ModelSelectorGroup<T extends ModelSelectorOptionBase> = {
  key: string;
  label: string;
  options: T[];
};

const WILDCARD_PATTERN = /[*?]/;

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function wildcardToRegExp(query: string): RegExp {
  const pattern = query
    .trim()
    .split('')
    .map((char) => {
      if (char === '*') return '.*';
      if (char === '?') return '.';
      return escapeRegExp(char);
    })
    .join('');

  return new RegExp(pattern, 'i');
}

export function matchesModelSearch(option: ModelSelectorOptionBase, query: string): boolean {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return true;

  const haystack = [option.label, option.id, option.providerName, option.providerId, option.searchText]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  if (WILDCARD_PATTERN.test(normalizedQuery)) {
    return wildcardToRegExp(normalizedQuery).test(haystack);
  }

  return haystack.toLowerCase().includes(normalizedQuery.toLowerCase());
}

export function getModelProviderLabel(option: ModelSelectorOptionBase, fallbackLabel: string): string {
  return option.providerName?.trim() || option.providerId?.trim() || fallbackLabel;
}

export function groupModelOptions<T extends ModelSelectorOptionBase>(
  options: T[],
  query: string,
  fallbackProviderLabel: string
): ModelSelectorGroup<T>[] {
  const groups = new Map<string, ModelSelectorGroup<T>>();

  for (const option of options) {
    if (!matchesModelSearch(option, query)) continue;

    const label = getModelProviderLabel(option, fallbackProviderLabel);
    const key = option.providerId || label;
    const existing = groups.get(key);

    if (existing) {
      existing.options.push(option);
    } else {
      groups.set(key, { key, label, options: [option] });
    }
  }

  return Array.from(groups.values());
}

export function parseFavoriteModelKeys(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0))
    );
  } catch {
    return [];
  }
}

export function serializeFavoriteModelKeys(keys: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(Array.from(keys).filter((key) => key.length > 0))));
}

export function cleanModelLabel(label: string): string {
  return label.replace(/^\[[^\]]+\]\s*/, '').trim();
}

/**
 * Pulls a `[provider]` token off the front of a model label.
 * Used for OpenCode-style backends that bake the provider into the label
 * string instead of populating `provider_id` / `provider_name` per model.
 */
export function extractProviderFromLabel(label: string): { providerId?: string; cleanLabel: string } {
  const match = /^\[([^\]]+)\]\s*/.exec(label);
  if (!match) return { cleanLabel: label.trim() };
  return {
    providerId: match[1].trim() || undefined,
    cleanLabel: label.slice(match[0].length).trim(),
  };
}
