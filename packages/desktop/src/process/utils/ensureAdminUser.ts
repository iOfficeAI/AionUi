/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-shot boot-time migration: move legacy admin credentials from
 * webui.config.json into aionui-backend's SQLite `users` table.
 *
 * Runs after backendManager.start() resolves, before any window opens, for
 * every launch mode (desktop / --webui / --resetpass). Idempotent — re-running
 * is a no-op once the SQLite `users` table has a real user.
 *
 * Failure policy: log and swallow. Next boot retries. Must not block startup.
 */

import { loadUserWebUIConfig, saveUserWebUIConfig } from './webuiConfig';

type AuthStatusResponse = {
  success?: boolean;
  needs_setup?: boolean;
  user_count?: number;
  is_authenticated?: boolean;
};

export async function ensureAdminUser(backendPort: number): Promise<void> {
  try {
    // 1. Ask backend whether SQLite already has a real user.
    const statusRes = await fetch(`http://127.0.0.1:${backendPort}/api/auth/status`);
    if (!statusRes.ok) {
      console.error(`[WebUI Migration] /api/auth/status returned ${statusRes.status}; skipping`);
      return;
    }
    const status = (await statusRes.json()) as AuthStatusResponse;
    if (status.needs_setup === false) {
      // SQLite has a real user; migration either already ran or never needed to.
      return;
    }

    // 2. Look for a legacy hash in webui.config.json.
    const { config, exists } = loadUserWebUIConfig();
    const legacyHash = typeof config.passwordHash === 'string' ? config.passwordHash : '';
    if (!exists || !legacyHash) {
      // Fresh install: no legacy credentials to migrate. Leave SQLite empty;
      // first-use password generation (Phase 1b) handles initial setup.
      return;
    }

    console.info('[WebUI Migration] Seeding system_default_user from legacy webui.config.json hash');

    // 3. Hand the legacy hash to backend. Idempotent: backend does
    // UPDATE ... WHERE id='system_default_user' so retries are safe.
    const body = JSON.stringify({
      username: config.adminUsername && config.adminUsername.length > 0 ? config.adminUsername : 'admin',
      password_hash: legacyHash,
    });
    const seedRes = await fetch(`http://127.0.0.1:${backendPort}/api/auth/internal/users/system/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!seedRes.ok) {
      const text = await seedRes.text().catch(() => '');
      console.error(`[WebUI Migration] credentials seed failed: ${seedRes.status} ${text}`);
      return;
    }

    // 4. Rewrite config without the legacy fields. If this step crashes the
    // next boot's status check returns needs_setup=false and this function
    // returns early without re-seeding — but the file is still cleaned up on
    // any future successful pass.
    await saveUserWebUIConfig(config);
    console.info('[WebUI Migration] Seed complete; legacy password fields stripped from webui.config.json');
  } catch (err) {
    // Swallow: next boot retries. Network/backend restart should not block
    // Electron from launching.
    console.error('[WebUI Migration] ensureAdminUser encountered an error:', err);
  }
}
