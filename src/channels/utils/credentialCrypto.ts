/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Credential storage utilities
 * Uses Base64 encoding for basic obfuscation when storing in database.
 * Note: This is not cryptographically secure, but provides basic protection
 * against casual inspection of the database file.
 */

/**
 * Check if encryption is available (always returns true for database storage)
 */
export function isEncryptionAvailable(): boolean {
  return true;
}

/**
 * Encode a string value for storage
 * @param plaintext - The string to encode
 * @returns Base64-encoded string with prefix
 */
export function encryptString(plaintext: string): string {
  if (!plaintext) return '';

  try {
    const encoded = Buffer.from(plaintext, 'utf-8').toString('base64');
    return `b64:${encoded}`;
  } catch (error) {
    console.error('[CredentialStorage] Encoding failed:', error);
    // Fallback to plain storage with prefix
    return `plain:${plaintext}`;
  }
}

/**
 * Decode a previously encoded string
 * @param encoded - The encoded string (with b64:, enc:, or plain: prefix)
 * @returns The decoded plaintext
 */
export function decryptString(encoded: string): string {
  if (!encoded) return '';

  // Handle plain: prefix
  if (encoded.startsWith('plain:')) {
    return encoded.slice(6);
  }

  // Handle b64: prefix (new format)
  if (encoded.startsWith('b64:')) {
    try {
      return Buffer.from(encoded.slice(4), 'base64').toString('utf-8');
    } catch (error) {
      console.error('[CredentialStorage] Decoding failed:', error);
      return '';
    }
  }

  // Handle enc: prefix (legacy format from safeStorage)
  // Try to decode as base64 for backward compatibility
  if (encoded.startsWith('enc:')) {
    console.warn('[CredentialStorage] Found legacy enc: format, attempting base64 decode');
    try {
      return Buffer.from(encoded.slice(4), 'base64').toString('utf-8');
    } catch {
      console.error('[CredentialStorage] Cannot decode legacy enc: format');
      return '';
    }
  }

  // Legacy: no prefix means it was stored before encoding was added
  // Return as-is for backward compatibility
  console.warn('[CredentialStorage] Found legacy unencoded value, returning as-is');
  return encoded;
}

/**
 * Encode credentials object
 * Only encodes sensitive fields (token)
 */
export function encryptCredentials(credentials: { token?: string } | undefined): { token?: string } | undefined {
  if (!credentials) return undefined;

  return {
    ...credentials,
    token: credentials.token ? encryptString(credentials.token) : undefined,
  };
}

/**
 * Decode credentials object
 */
export function decryptCredentials(credentials: { token?: string } | undefined): { token?: string } | undefined {
  if (!credentials) return undefined;

  return {
    ...credentials,
    token: credentials.token ? decryptString(credentials.token) : undefined,
  };
}
