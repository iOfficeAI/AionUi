/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const FILE_NAME = 'analytics.json';

type AnalyticsData = { id: string };

/**
 * Returns a persistent anonymous analytics ID for this installation.
 * Stored in app.getPath('userData')/analytics.json.
 * No personal data is collected — the ID is a random UUID.
 */
export function getOrCreateAnalyticsId(): string {
  const filePath = path.join(app.getPath('userData'), FILE_NAME);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AnalyticsData;
      if (typeof data?.id === 'string' && data.id.length > 0) {
        return data.id;
      }
    }
  } catch {
    // fall through to generate a new one
  }

  const id = crypto.randomUUID();
  try {
    fs.writeFileSync(filePath, JSON.stringify({ id }), { mode: 0o600 });
  } catch {
    // best-effort — if write fails, the ID won't persist but won't throw either
  }
  return id;
}
