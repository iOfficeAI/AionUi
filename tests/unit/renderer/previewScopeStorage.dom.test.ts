/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Persisted preview scopes are bounded and can be cleared.
//
// Before this, `preview-ui:<scope>` had no cleanup anywhere: every project ever
// opened kept its entry forever, logout didn't touch it (that sweep only matched
// auth/csrf/token), and a full quota was swallowed by a bare `catch {}` — so
// persistence stopped working with nothing telling the user why their tabs no
// longer came back.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PREVIEW_SCOPE_KEY_PREFIX,
  clearPersistedPreviewScopes,
  listPersistedPreviewScopeKeys,
  previewScopeStorageKey,
} from '@/renderer/pages/conversation/Preview/context/previewScope';

const seedScope = (scope: string, savedAt?: number): void => {
  localStorage.setItem(
    previewScopeStorageKey(scope),
    JSON.stringify({ isOpen: true, tabs: [], activeTabId: null, ...(savedAt === undefined ? {} : { savedAt }) })
  );
};

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('preview scope storage keys', () => {
  it('namespaces a scope under the shared prefix', () => {
    expect(previewScopeStorageKey('proj-1')).toBe(`${PREVIEW_SCOPE_KEY_PREFIX}proj-1`);
  });

  it('lists only preview-scope keys, ignoring everything else in storage', () => {
    seedScope('a');
    seedScope('b');
    localStorage.setItem('auth_token', 'x');
    localStorage.setItem('unrelated', 'y');

    expect(listPersistedPreviewScopeKeys().toSorted()).toEqual(
      [previewScopeStorageKey('a'), previewScopeStorageKey('b')].toSorted()
    );
  });

  it('returns nothing when no scope has been persisted', () => {
    localStorage.setItem('auth_token', 'x');
    expect(listPersistedPreviewScopeKeys()).toEqual([]);
  });
});

describe('clearPersistedPreviewScopes', () => {
  // Logout: these entries are keyed by project and hold file content, so leaving
  // them would show the next account the previous one's open tabs.
  it('removes every persisted scope', () => {
    seedScope('a');
    seedScope('b');
    seedScope('c');

    clearPersistedPreviewScopes();

    expect(listPersistedPreviewScopeKeys()).toEqual([]);
  });

  it('leaves unrelated storage untouched', () => {
    seedScope('a');
    localStorage.setItem('keep-me', 'value');
    localStorage.setItem('theme', 'dark');

    clearPersistedPreviewScopes();

    expect(localStorage.getItem('keep-me')).toBe('value');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('is safe to call when nothing is persisted', () => {
    expect(() => clearPersistedPreviewScopes()).not.toThrow();
  });
});
