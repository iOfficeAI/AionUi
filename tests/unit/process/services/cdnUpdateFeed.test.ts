/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { UpdateInfo } from 'electron-updater';
import type { AppUpdater } from 'electron-updater/out/AppUpdater';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';
import { CdnGenericProvider } from '@/process/services/cdnGenericProvider';
import { buildCdnFeedOptions, CDN_UPDATE_BASE_URL } from '@/process/services/updateFeed';

const makeRuntimeOptions = (): ProviderRuntimeOptions => ({
  isUseMultipleRangeRequest: true,
  platform: 'darwin',
  executor: {
    request: vi.fn(),
  } as unknown as ProviderRuntimeOptions['executor'],
});

describe('CDN update feed options', () => {
  it('builds a custom electron-updater provider pointed at the release CDN', () => {
    const options = buildCdnFeedOptions();

    expect(options.provider).toBe('custom');
    expect(options.url).toBe(CDN_UPDATE_BASE_URL);
    expect(options.updateProvider).toBe(CdnGenericProvider);
  });
});

describe('CdnGenericProvider', () => {
  it('resolves relative update files under the version directory', () => {
    const provider = new CdnGenericProvider(
      {
        provider: 'custom',
        url: 'https://static.aionui.com/releases',
      },
      {} as AppUpdater,
      makeRuntimeOptions()
    );

    const files = provider.resolveFiles({
      version: '2.1.14',
      files: [
        {
          url: 'AionUi-2.1.14-mac-arm64.dmg',
          sha512: 'sha512-value',
        },
      ],
      path: 'AionUi-2.1.14-mac-arm64.dmg',
      sha512: 'sha512-value',
      releaseDate: '2026-06-08T00:00:00.000Z',
    } satisfies UpdateInfo);

    expect(files[0]?.url.href).toBe('https://static.aionui.com/releases/2.1.14/AionUi-2.1.14-mac-arm64.dmg');
  });
});
