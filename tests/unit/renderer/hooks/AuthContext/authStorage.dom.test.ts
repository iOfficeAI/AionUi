/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAccountScopedBrowserState,
  normalizeAuthUserPayload,
  prepareAccountLogout,
  prepareAuthenticatedAccount,
  readRememberedLogin,
  writeRememberedLogin,
} from '@/renderer/hooks/context/AuthContext/authStorage';

const throwingStorage = {
  get length(): number {
    throw new DOMException('denied', 'SecurityError');
  },
  clear(): void {
    throw new DOMException('denied', 'SecurityError');
  },
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  },
  key(): string | null {
    throw new DOMException('denied', 'SecurityError');
  },
  removeItem(): void {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem(): void {
    throw new DOMException('denied', 'SecurityError');
  },
} satisfies Storage;

describe('browser account storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes passwords written by older releases while restoring only the username hint', () => {
    localStorage.setItem('rememberMe', 'true');
    localStorage.setItem('rememberedUsername', 'nicolae');
    localStorage.setItem('rememberedPassword', 'reversible-secret');

    expect(readRememberedLogin()).toEqual({ remember: true, username: 'nicolae' });
    expect(localStorage.getItem('rememberedPassword')).toBeNull();
  });

  it('never writes a password when remembering a login', () => {
    localStorage.setItem('rememberedPassword', 'legacy');

    writeRememberedLogin('member-one', true);

    expect(localStorage.getItem('rememberedUsername')).toBe('member-one');
    expect(localStorage.getItem('rememberedPassword')).toBeNull();
  });

  it('clears user content but retains global language, theme, and login preferences', () => {
    localStorage.setItem('i18nextLng', 'de-DE');
    localStorage.setItem('__aionui_theme', 'dark');
    localStorage.setItem('rememberedUsername', 'member-one');
    localStorage.setItem('conversation.historySearch.recentKeywords', '["secret"]');
    localStorage.setItem('aionui:recent-workspaces', '["/private/project"]');
    sessionStorage.setItem('acp_initial_message_1', '{"text":"secret"}');

    clearAccountScopedBrowserState();

    expect(localStorage.getItem('i18nextLng')).toBe('de-DE');
    expect(localStorage.getItem('__aionui_theme')).toBe('dark');
    expect(localStorage.getItem('conversation.historySearch.recentKeywords')).toBeNull();
    expect(localStorage.getItem('aionui:recent-workspaces')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('clears scoped state only when the authenticated account changes', () => {
    localStorage.setItem('aionui.auth.lastUserId', 'user-a');
    localStorage.setItem('team-active-slot-team-1', 'lead');

    expect(prepareAuthenticatedAccount('user-a')).toBe(false);
    expect(localStorage.getItem('team-active-slot-team-1')).toBe('lead');

    expect(prepareAuthenticatedAccount('user-b')).toBe(true);
    expect(localStorage.getItem('team-active-slot-team-1')).toBeNull();
    expect(localStorage.getItem('aionui.auth.lastUserId')).toBe('user-b');
  });

  it('clears unknown legacy state on the first account-aware login', () => {
    localStorage.setItem('aionui:recent-workspaces', '["/previous/private/project"]');

    expect(prepareAuthenticatedAccount('user-a')).toBe(true);
    expect(localStorage.getItem('aionui:recent-workspaces')).toBeNull();
    expect(localStorage.getItem('aionui.auth.lastUserId')).toBe('user-a');
  });

  it('normalizes the pinned Core system user without weakening future account fields', () => {
    expect(normalizeAuthUserPayload({ id: 'system_default_user', username: 'admin' })).toEqual({
      id: 'system_default_user',
      username: 'admin',
      role: 'admin',
      status: 'active',
      must_change_password: false,
    });
    expect(
      normalizeAuthUserPayload({
        id: 'member-1',
        username: 'member',
        role: 'member',
        status: 'disabled',
        must_change_password: true,
      })
    ).toMatchObject({ role: 'member', status: 'disabled', must_change_password: true });
    expect(normalizeAuthUserPayload({ id: 'member-2', username: 'member', status: 'unexpected' })).toBeNull();
  });

  it('treats unavailable browser storage as best-effort during every auth transition', () => {
    expect(readRememberedLogin(throwingStorage)).toEqual({ remember: false, username: '' });
    expect(() => writeRememberedLogin('member-one', true, throwingStorage)).not.toThrow();
    expect(() => clearAccountScopedBrowserState(throwingStorage, throwingStorage)).not.toThrow();
    expect(prepareAuthenticatedAccount('member-one', throwingStorage, throwingStorage)).toBe(true);
    expect(() => prepareAccountLogout('member-one', throwingStorage, throwingStorage)).not.toThrow();
  });
});
