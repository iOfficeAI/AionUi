/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const uuid = (length = 8) => {
  try {
    // Prefer cryptographically strong randomness
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    if (typeof crypto.randomUUID === 'function' && length >= 36) {
      return crypto.randomUUID();
    }
    const bytes = crypto.randomBytes(Math.ceil(length / 2));
    return bytes.toString('hex').slice(0, length);
  } catch {
    // Monotonic fallback without insecure randomness
    const base = Date.now().toString(36);
    return (base + base).slice(0, length);
  }
};

export const parseError = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return error.msg || error.message || JSON.stringify(error);
};
