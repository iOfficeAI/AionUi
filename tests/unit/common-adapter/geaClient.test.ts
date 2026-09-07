import { describe, expect, it, vi } from 'vitest';
import { GeaClientAdapter } from '@/common/adapter/geaClient';

describe('GeaClientAdapter', () => {
  it('accepts a successful GEA envelope with a null errorCode', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            message: '',
            code: 200,
            result: {
              upgradeAvailable: false,
              mandatory: false,
              versionName: null,
              versionCode: null,
              releaseNotes: null,
              downloadUrl: null,
              distributionType: null,
              fileSize: null,
              sha256: null,
            },
            errorCode: null,
          })
        )
    );
    const client = new GeaClientAdapter('https://gea.example.com/gea-boot', fetchImpl as typeof fetch);

    await expect(
      client.check({ platform: 'MACOS', architecture: 'arm64', versionName: '2.1.61-dev-20260905', versionCode: 0 })
    ).resolves.toEqual({
      upgradeAvailable: false,
      mandatory: false,
      versionName: null,
      versionCode: null,
      releaseNotes: null,
      downloadUrl: null,
      distributionType: null,
      fileSize: null,
      sha256: null,
    });
  });
});
