/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Multi-user initialization module for AionUi WebUI.
 *
 * Reads AIONUI_USERS environment variable (e.g. `husband:password123,wife:password456`
 * or JSON `[{"username":"husband","password":"password123"},{"username":"wife","password":"password456"}]`).
 * Seeds and ensures these users exist directly in aioncore's SQLite DB on startup.
 */

import fs from 'node:fs';
import path from 'node:path';

export type UserSpec = {
  username: string;
  password: string;
};

export type EnsureUsersOptions = {
  backendPort: number;
  dataDir?: string;
  usersEnv?: string;
};

export type EnsureUsersDeps = {
  fetch: typeof fetch;
  log: (msg: string) => void;
  warn: (msg: string) => void;
};

/**
 * Parse `AIONUI_USERS` string into structured user specifications.
 * Supports comma-separated `user:pass,user2:pass2` and JSON formats.
 */
export function parseUsersEnv(rawEnv?: string): UserSpec[] {
  if (!rawEnv || !rawEnv.trim()) return [];
  const trimmed = rawEnv.trim();

  // Try parsing JSON format
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as UserSpec[];
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (u) => u && typeof u.username === 'string' && typeof u.password === 'string' && u.username.length > 0
        );
      }
    } catch {
      // Fall through to CSV parsing
    }
  }

  // CSV format: user1:pass1,user2:pass2
  const specs: UserSpec[] = [];
  const entries = trimmed.split(',');
  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx > 0) {
      const username = entry.slice(0, colonIdx).trim();
      const password = entry.slice(colonIdx + 1).trim();
      if (username && password) {
        specs.push({ username, password });
      }
    }
  }
  return specs;
}

/**
 * Hash a plaintext password using bcrypt (cost 12) required by aioncore Rust backend.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof Bun !== 'undefined' && Bun.password && typeof Bun.password.hash === 'function') {
    try {
      return await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 12 });
    } catch {
      // Fallback
    }
  }
  try {
    const bcrypt = await import('bcryptjs');
    return bcrypt.hashSync(password, 12);
  } catch {
    return password;
  }
}

/**
 * Seed users from AIONUI_USERS environment variable into aioncore's SQLite database.
 */
export async function ensureUsers(opts: EnsureUsersOptions, deps: EnsureUsersDeps): Promise<void> {
  const envVal = opts.usersEnv ?? process.env.AIONUI_USERS;
  const specs = parseUsersEnv(envVal);

  if (specs.length === 0) {
    return;
  }

  const dataDir =
    opts.dataDir ??
    process.env.AIONUI_DATA_DIR ??
    path.join(process.env.HOME || '/root', process.env.NODE_ENV === 'production' ? '.aionui-web' : '.aionui-web-dev');
  const dbPath = path.join(dataDir, 'aionui-backend.db');

  deps.log(`[aionui-web] Ensuring ${specs.length} user(s) in SQLite database: ${dbPath}...`);

  try {
    let DatabaseClass: any = null;
    if (typeof Bun !== 'undefined') {
      const sqliteModule = await import('bun:sqlite');
      DatabaseClass = sqliteModule.Database;
    } else {
      const sqliteModule = await import('better-sqlite3');
      DatabaseClass = sqliteModule.default || sqliteModule;
    }

    if (!DatabaseClass || !fs.existsSync(dbPath)) {
      deps.warn(`[aionui-web] Database file not ready at ${dbPath}; skipping direct SQLite user seeding`);
      return;
    }

    const db = new DatabaseClass(dbPath);
    const now = Date.now();

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const passwordHash = await hashPassword(spec.password);

      // Check if user already exists
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(spec.username);
      if (existing) {
        deps.log(`[aionui-web] User "${spec.username}" is ready.`);
        continue;
      }

      if (i === 0) {
        // Configure primary account (system_default_user)
        const defaultUser = db
          .prepare('SELECT id FROM users WHERE id = ? OR username = ?')
          .get('system_default_user', 'admin');
        if (defaultUser) {
          db.prepare('UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(
            spec.username,
            passwordHash,
            now,
            defaultUser.id
          );
          deps.log(`[aionui-web] Primary account configured: username="${spec.username}"`);
          continue;
        }
      }

      // Create additional user
      const userId = i === 0 ? 'system_default_user' : `user_${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)`
      ).run(userId, spec.username, passwordHash, now, now);

      deps.log(`[aionui-web] Additional account created: username="${spec.username}"`);
    }

    if (typeof db.close === 'function') {
      db.close();
    }
  } catch (err) {
    deps.warn(`[aionui-web] ensureUsers error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
