/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { __TEST__ } from '@process/bridge/services/NewApiDesktopAccountService';

describe('NewApiDesktopAccountService openclaw cleanup', () => {
  const cleanupTargets = new Set<string>();

  afterEach(() => {
    for (const target of cleanupTargets) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    cleanupTargets.clear();
    delete process.env.OPENCLAW_CONFIG_PATH;
  });

  it('deletes openclaw config entirely when only managed runtime state remains', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pounding-openclaw-cleanup-'));
    cleanupTargets.add(tempDir);
    const configPath = path.join(tempDir, 'openclaw.json');
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          models: {
            providers: {
              'pounding-api-desktop-newapi-managed-provider': {
                baseUrl: 'https://api.mxou.cn/v1',
                apiKey: 'secret-openclaw',
                models: [{ id: 'mimo-v2.5', name: 'mimo-v2.5' }],
              },
            },
          },
          agents: {
            defaults: {
              model: {
                primary: 'pounding-api-desktop-newapi-managed-provider/mimo-v2.5',
              },
              models: {
                'pounding-api-desktop-newapi-managed-provider/mimo-v2.5': {
                  alias: 'mimo-v2.5',
                },
              },
            },
          },
        },
        null,
        2
      )
    );

    __TEST__.clearOpenClawManagedProviderModel('pounding-api-desktop-newapi-managed-provider');

    expect(fs.existsSync(configPath)).toBe(false);
  });
});
