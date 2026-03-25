/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadedExtension } from '../../../src/process/extensions/types';
import { resolveWebuiContributions } from '../../../src/process/extensions/resolvers/WebuiResolver';

const tempRoots: string[] = [];

function createTempExtension(
  name: string,
  webui: NonNullable<LoadedExtension['manifest']['contributes']['webui']>
): LoadedExtension {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `aionui-ext-${name}-`));
  tempRoots.push(root);

  fs.mkdirSync(path.join(root, 'webui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'webui', 'route.js'), 'module.exports = (req, res) => res.json({ ok: true });');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });

  return {
    source: 'local',
    directory: root,
    manifest: {
      name,
      displayName: name,
      version: '1.0.0',
      contributes: { webui },
    } as LoadedExtension['manifest'],
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('extensions/WebuiResolver', () => {
  it('过滤非命名空间和保留前缀路径，只保留安全 WebUI 贡献', () => {
    const ext = createTempExtension('ext-safe', {
      apiRoutes: [
        { path: '/api/hijack', entryPoint: 'webui/route.js' },
        { path: '/ext-safe/collect', entryPoint: 'webui/route.js' },
      ],
      staticAssets: [
        { urlPrefix: '/', directory: 'assets' },
        { urlPrefix: '/ext-safe/assets', directory: 'assets' },
      ],
    });

    const result = resolveWebuiContributions([ext]);
    expect(result).toHaveLength(1);
    expect(result[0].config.apiRoutes?.map((r) => r.path)).toEqual(['/ext-safe/collect']);
    expect(result[0].config.staticAssets?.map((r) => r.urlPrefix)).toEqual(['/ext-safe/assets']);
  });

  it('当没有有效 apiRoutes/staticAssets 时应忽略该扩展的 webui 贡献', () => {
    const ext = createTempExtension('ext-empty', {
      wsHandlers: [{ namespace: '/ext-empty/ws', entryPoint: 'webui/route.js' }],
      middleware: [{ entryPoint: 'webui/route.js', applyTo: '/**' }],
    });

    const result = resolveWebuiContributions([ext]);
    expect(result).toHaveLength(0);
  });
});
