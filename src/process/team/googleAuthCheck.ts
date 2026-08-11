/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/** Check whether Google OAuth credentials exist on disk */
export async function hasGeminiOauthCreds(): Promise<boolean> {
  try {
    const credsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
    const content = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(content) as { access_token?: string; refresh_token?: string };
    return Boolean(creds.access_token || creds.refresh_token);
  } catch {
    return false;
  }
}
