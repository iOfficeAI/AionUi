/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bcrypt adapter to handle bcrypt loading in both development and production
 * Resolves module path issues in ASAR-packaged applications with pbkdf2 fallback
 */

import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';

export type BcryptAdapter = {
  hash(password: string, rounds: number): Promise<string>;
  compare(password: string, hashed: string): Promise<boolean>;
};

// Helper function for pbkdf2 hashing
const pbkdf2Hash = (password: string, salt: Buffer, iterations: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, derived) => {
      if (err) {
        reject(err);
      } else {
        resolve(derived);
      }
    });
  });

// Fallback implementation using Node.js built-in crypto
const createPbkdf2Adapter = (): BcryptAdapter => ({
  hash: async (password: string) => {
    const iterations = 120_000;
    const salt = crypto.randomBytes(16);
    const derived = await pbkdf2Hash(password, salt, iterations);
    return `pbkdf2$${iterations}$${salt.toString('base64')}$${derived.toString('base64')}`;
  },
  compare: async (password: string, hashed: string) => {
    if (hashed.startsWith('pbkdf2$')) {
      const [, iterStr, saltB64, hashB64] = hashed.split('$');
      const iterations = Number(iterStr);
      if (!iterations || !saltB64 || !hashB64) {
        return false;
      }
      const salt = Buffer.from(saltB64, 'base64');
      const expected = Buffer.from(hashB64, 'base64');
      const derived = await pbkdf2Hash(password, salt, iterations);
      return crypto.timingSafeEqual(derived, expected);
    }

    // If it's not a pbkdf2 hash, it might be a bcrypt hash
    // We can't verify bcrypt hashes without the native module
    console.warn('[BcryptAdapter] Cannot verify bcrypt hash without native bcrypt module');
    return false;
  },
});

let bcryptModule: typeof import('bcrypt') | null = null;
let loadAttempted = false;

/**
 * Try to load bcrypt with ASAR-aware path resolution
 */
function loadBcrypt(): typeof import('bcrypt') | null {
  if (loadAttempted) {
    return bcryptModule;
  }

  loadAttempted = true;

  try {
    // Try normal require first (works in development and when properly packaged)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let nativeModule: any = require('bcrypt');

    // Handle Webpack commonjs wrapper (.default)
    // Webpack may wrap the module with { default: actualModule }
    if (nativeModule.default && typeof nativeModule.default === 'object') {
      nativeModule = nativeModule.default;
    }

    bcryptModule = nativeModule;
    console.log('[BcryptAdapter] Successfully loaded bcrypt via normal require');
    return bcryptModule;
  } catch (error) {
    console.warn('[BcryptAdapter] Failed to load bcrypt via normal require:', error);

    // In production ASAR package, the module might be in app.asar.unpacked
    if (app.isPackaged) {
      try {
        const appPath = app.getAppPath();
        console.log('[BcryptAdapter] App path:', appPath);

        // Try different possible locations for unpacked modules
        const possiblePaths = [
          // Standard ASAR unpacked location
          path.join(path.dirname(appPath), 'app.asar.unpacked', 'node_modules', 'bcrypt'),
          // Alternative: if app.asar is in resources
          path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'node_modules', 'bcrypt'),
          // Direct node_modules (non-ASAR build)
          path.join(appPath, 'node_modules', 'bcrypt'),
        ];

        for (const modulePath of possiblePaths) {
          try {
            console.log('[BcryptAdapter] Trying to load from:', modulePath);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            let nativeModule: any = require(modulePath);

            // Handle Webpack wrapper
            if (nativeModule.default && typeof nativeModule.default === 'object') {
              nativeModule = nativeModule.default;
            }

            bcryptModule = nativeModule;
            console.log('[BcryptAdapter] Successfully loaded bcrypt from:', modulePath);
            return bcryptModule;
          } catch (e) {
            // Continue to next path
            console.log('[BcryptAdapter] Not found at:', modulePath);
          }
        }

        console.warn('[BcryptAdapter] Failed to load bcrypt from any known location. Tried:', possiblePaths.join(', '));
      } catch (fallbackError) {
        console.error('[BcryptAdapter] All fallback paths failed:', fallbackError);
      }
    }

    return null;
  }
}

/**
 * Get the bcrypt adapter (native bcrypt or pbkdf2 fallback)
 */
export function getBcryptAdapter(): BcryptAdapter {
  const native = loadBcrypt();

  if (native) {
    console.log('[BcryptAdapter] Using native bcrypt module');
    return {
      hash: (password: string, rounds: number) => native.hash(password, rounds),
      compare: (password: string, hashed: string) => native.compare(password, hashed),
    };
  }

  console.warn('[BcryptAdapter] Using pbkdf2 fallback (bcrypt not available)');
  return createPbkdf2Adapter();
}

// Export singleton instance
let adapterInstance: BcryptAdapter | null = null;

/**
 * Get the singleton bcrypt adapter instance
 */
export function getBcryptAdapterSingleton(): BcryptAdapter {
  if (!adapterInstance) {
    adapterInstance = getBcryptAdapter();
  }
  return adapterInstance;
}
