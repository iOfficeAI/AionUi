/* Type declarations for @aionui/native */

export function isEncryptionAvailable(): boolean;
export function encryptString(plaintext: string): string;
export function decryptString(encoded: string): string;
export function encryptCredentials(
  credentials: Record<string, string | number | boolean | undefined> | undefined | null
): Record<string, string | number | boolean | undefined> | null;
export function decryptCredentials(
  credentials: Record<string, string | number | boolean | undefined> | undefined | null
): Record<string, string | number | boolean | undefined> | null;
