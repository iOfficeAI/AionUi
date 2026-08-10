/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * The packaged `aionui-web start` path must launch Core in webui identity mode.
 * Shipping `identityMode: 'local'` with AIONUI_ALLOW_REMOTE=true disables auth and
 * is unsafe for team Docker/LAN hosting. This test reads the shipped source entry
 * (not a reimplementation) so a regression is caught before the image is rebuilt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');

describe('aionui-web start identity mode', () => {
  it('starts the backend in webui mode and only uses local for emergency resetpass', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'packages/web-cli/src/index.ts'), 'utf8');

    // Primary public entry: startWebHost for `start` must use webui identity.
    expect(source).toMatch(/identityMode:\s*'webui'/);

    // Emergency resetpass may use local (loopback + local secret); that path must
    // not be the only identityMode in the file.
    const webuiMatches = source.match(/identityMode:\s*'webui'/g) ?? [];
    const localMatches = source.match(/identityMode:\s*'local'/g) ?? [];
    expect(webuiMatches.length).toBeGreaterThanOrEqual(1);
    expect(localMatches.length).toBeGreaterThanOrEqual(1);

    // Guard: remote hosting cannot pair allowRemote with local identity.
    const host = fs.readFileSync(path.join(repoRoot, 'packages/web-host/src/index.ts'), 'utf8');
    expect(host).toMatch(/allowRemote && opts\.backend\.identityMode === 'local'/);
    expect(host).toMatch(/Remote WebUI requires an authenticated webui backend/);
  });
});
