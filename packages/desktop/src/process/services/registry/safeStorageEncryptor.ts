/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EncryptedCredentialBlob, HttpServerCredentialEncryptor } from '@/common/registry';

function loadElectronSafeStorage(): Electron.SafeStorage | null {
  if (!process.versions?.electron) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { safeStorage?: Electron.SafeStorage };
    if (electron.safeStorage && typeof electron.safeStorage.encryptString === 'function') {
      return electron.safeStorage;
    }
  } catch {
    /* not in Electron main process */
  }
  return null;
}

export function createSafeStorageEncryptor(): HttpServerCredentialEncryptor {
  const safeStorage = loadElectronSafeStorage();

  if (safeStorage) {
    return {
      encrypt(plaintext: string): EncryptedCredentialBlob | undefined {
        try {
          if (!safeStorage.isEncryptionAvailable()) return undefined;
          const buffer = safeStorage.encryptString(plaintext);
          return { ciphertext: buffer.toString('base64'), encoding: 'base64' };
        } catch {
          return undefined;
        }
      },
      decrypt(blob: EncryptedCredentialBlob): string | undefined {
        try {
          if (!safeStorage.isEncryptionAvailable()) return undefined;
          const buffer = Buffer.from(blob.ciphertext, 'base64');
          return safeStorage.decryptString(buffer);
        } catch {
          return undefined;
        }
      },
    };
  }

  return createVolatileMemoryEncryptor();
}

export function createVolatileMemoryEncryptor(): HttpServerCredentialEncryptor {
  const store = new Map<string, string>();
  let counter = 0;

  return {
    encrypt(plaintext: string): EncryptedCredentialBlob {
      const id = String(++counter);
      store.set(id, plaintext);
      return { ciphertext: id, encoding: 'base64' };
    },
    decrypt(blob: EncryptedCredentialBlob): string | undefined {
      return store.get(blob.ciphertext);
    },
  };
}
