import { describe, expect, it } from 'vitest';
import {
  decodeRememberedUsername,
  encodeRememberedUsername,
  LEGACY_REMEMBERED_PASSWORD_KEY,
  loadRememberedLogin,
  persistRememberedLogin,
  REMEMBERED_USERNAME_KEY,
  REMEMBER_ME_KEY,
} from '@/renderer/pages/login/rememberMeStorage';

class MemoryStorage implements Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('login remember-me storage', () => {
  it('stores only an obfuscated username and never keeps the legacy password key', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_REMEMBERED_PASSWORD_KEY, 'secret-password');

    persistRememberedLogin(storage, {
      rememberMe: true,
      username: 'mathias@example.com',
    });

    expect(storage.getItem(REMEMBER_ME_KEY)).toBe('true');
    expect(storage.getItem(REMEMBERED_USERNAME_KEY)).not.toBe('mathias@example.com');
    expect(decodeRememberedUsername(storage.getItem(REMEMBERED_USERNAME_KEY) || '')).toBe('mathias@example.com');
    expect(storage.getItem(LEGACY_REMEMBERED_PASSWORD_KEY)).toBeNull();
  });

  it('purges remembered credentials when remember-me is disabled', () => {
    const storage = new MemoryStorage();
    storage.setItem(REMEMBER_ME_KEY, 'true');
    storage.setItem(REMEMBERED_USERNAME_KEY, encodeRememberedUsername('mathias@example.com'));
    storage.setItem(LEGACY_REMEMBERED_PASSWORD_KEY, 'secret-password');

    persistRememberedLogin(storage, {
      rememberMe: false,
      username: 'mathias@example.com',
    });

    expect(storage.getItem(REMEMBER_ME_KEY)).toBeNull();
    expect(storage.getItem(REMEMBERED_USERNAME_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_REMEMBERED_PASSWORD_KEY)).toBeNull();
  });

  it('loads the remembered username while purging the legacy password key', () => {
    const storage = new MemoryStorage();
    storage.setItem(REMEMBER_ME_KEY, 'true');
    storage.setItem(REMEMBERED_USERNAME_KEY, encodeRememberedUsername('mathias@example.com'));
    storage.setItem(LEGACY_REMEMBERED_PASSWORD_KEY, 'secret-password');

    expect(loadRememberedLogin(storage)).toEqual({
      rememberMe: true,
      username: 'mathias@example.com',
    });
    expect(storage.getItem(LEGACY_REMEMBERED_PASSWORD_KEY)).toBeNull();
  });

  it('falls back to an empty username for malformed remembered values', () => {
    const storage = new MemoryStorage();
    storage.setItem(REMEMBER_ME_KEY, 'true');
    storage.setItem(REMEMBERED_USERNAME_KEY, 'not-valid-base64');

    expect(loadRememberedLogin(storage)).toEqual({
      rememberMe: true,
      username: '',
    });
  });
});
