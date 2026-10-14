/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from 'electron';

/**
 * Secure Credential Store.
 * Uses Electron's native safeStorage (backed by OS Keychain on macOS, DPAPI on Windows,
 * or libsecret on Linux). If safeStorage is unavailable, it deliberately refuses to persist
 * sensitive secrets to plaintext files and instead stores them in memory per session only.
 */
export class SecureCredentialStore {
  private sessionMemoryStore: Map<string, string> = new Map();

  /**
   * Encrypt a sensitive token string.
   * If safeStorage is not available, returns an ephemeral session key and stores in memory.
   */
  encrypt(plaintext: string, secretId?: string): string {
    if (!plaintext) return '';
    if (typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(plaintext);
      return `safe:${encrypted.toString('base64')}`;
    }

    // safeStorage unavailable: store strictly in volatile session memory
    const key = secretId || `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.sessionMemoryStore.set(key, plaintext);
    return `session_mem:${key}`;
  }

  /**
   * Decrypt a stored credential string.
   */
  decrypt(cipherPayload: string): string {
    if (!cipherPayload) return '';
    if (cipherPayload.startsWith('safe:')) {
      if (typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable()) {
        try {
          const raw = Buffer.from(cipherPayload.slice(5), 'base64');
          return safeStorage.decryptString(raw);
        } catch {
          return '';
        }
      }
      return '';
    }

    if (cipherPayload.startsWith('session_mem:')) {
      const key = cipherPayload.slice('session_mem:'.length);
      return this.sessionMemoryStore.get(key) || '';
    }

    return '';
  }

  clearSession(): void {
    this.sessionMemoryStore.clear();
  }
}

export const secureCredentialStore = new SecureCredentialStore();
