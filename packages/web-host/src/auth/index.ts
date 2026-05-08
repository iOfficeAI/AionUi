/**
 * Public auth API (UC-3 contract, frozen signatures).
 *
 * Five entry points are exposed here:
 *   - resetPassword   : CLI `--resetpass` + desktop GUI reset button
 *   - changePassword  : desktop preload `webuiChangePassword` IPC
 *   - verifyPassword  : internal /api/auth/login handler
 *   - loadConfig      : exported for session/rate-limit/orchestration reuse
 *   - saveConfig      : exported for session/rate-limit/orchestration reuse
 *
 * Implementation notes (M5):
 *   - Storage: userDataPath/webui.config.json (see ./config.ts)
 *   - Hashing: bcryptjs (matches legacy webserver dependency)
 *   - No HTTP dependency; pure I/O + crypto.
 */

import bcrypt from 'bcryptjs';
import type { AppMetadata, WebUIConfig } from '../types.js';
import { readConfig, writeConfig } from './config.js';

export { readConfig as loadConfig, writeConfig as saveConfig };

const BCRYPT_SALT_ROUNDS = 10; // matches legacy resetPasswordCLI.ts hashPassword
const PASSWORD_LENGTH = 12;
const PASSWORD_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRandomPassword(): string {
  const out: string[] = [];
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    const idx = Math.floor(Math.random() * PASSWORD_ALPHABET.length);
    out.push(PASSWORD_ALPHABET[idx]);
  }
  return out.join('');
}

/**
 * Reset password to a freshly generated value. Persists immediately.
 * Returns the plaintext password (caller displays to user / returns to CLI).
 */
export async function resetPassword(opts: { app: AppMetadata }): Promise<string> {
  const cfg = await readConfig(opts.app);
  const newPassword = generateRandomPassword();
  const hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  const next: WebUIConfig = {
    ...cfg,
    passwordHash: hash,
    adminUsername: cfg.adminUsername || 'admin',
    passwordUpdatedAt: new Date().toISOString(),
  };
  await writeConfig(opts.app, next);
  return newPassword;
}

/**
 * Change password after verifying the old one.
 * Throws on verification failure; caller maps to the correct HTTP status.
 */
export async function changePassword(opts: {
  app: AppMetadata;
  oldPassword: string;
  newPassword: string;
}): Promise<void> {
  const cfg = await readConfig(opts.app);
  if (!cfg.passwordHash) {
    throw new Error('PASSWORD_NOT_INITIALIZED');
  }
  const ok = await bcrypt.compare(opts.oldPassword, cfg.passwordHash);
  if (!ok) {
    throw new Error('INVALID_OLD_PASSWORD');
  }
  const hash = await bcrypt.hash(opts.newPassword, BCRYPT_SALT_ROUNDS);
  await writeConfig(opts.app, {
    ...cfg,
    passwordHash: hash,
    passwordUpdatedAt: new Date().toISOString(),
  });
}

/**
 * Compare password against stored bcrypt hash. Returns false for missing config,
 * empty hash, or mismatched password; never throws on those paths.
 */
export async function verifyPassword(opts: {
  app: AppMetadata;
  password: string;
}): Promise<boolean> {
  const cfg = await readConfig(opts.app);
  if (!cfg.passwordHash) return false;
  try {
    return await bcrypt.compare(opts.password, cfg.passwordHash);
  } catch {
    return false;
  }
}
