import { describe, expect, it, vi } from 'vitest';
import { GeaClientAdapter, getGeaPackageExtension } from '@/common/adapter/geaClient';

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

describe('GEA private OSS downloads', () => {
  const host = 'synear-gea.oss-cn-hangzhou.aliyuncs.com';
  it.each([
    ['https://gea.synear.cn/gea-boot', true],
    ['https://other.example/gea-boot', false],
  ])('scopes the built-in storage host to %s', async (base, accepted) => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.startsWith(base)
        ? new Response(null, {
            status: 302,
            headers: { location: `https://${host}/client-release/pkg.dmg?signature=opaque` },
          })
        : new Response('package')
    );
    const client = new GeaClientAdapter(base as string, fetchImpl as typeof fetch);
    const result = client.download(
      `${base}/api/v1/public/client-releases/download/ticket`,
      [],
      new AbortController().signal
    );
    if (accepted) {
      const response = await result;
      expect(response.status).toBe(200);
      await response.body?.cancel();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } else {
      await expect(result).rejects.toMatchObject({ code: 'CLIENT_DOWNLOAD_TARGET_INVALID' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it.each(['https://evil.example/pkg.dmg', `http://${host}/pkg.dmg`, `https://${host}.evil.example/pkg.dmg`])(
    'rejects untrusted redirect %s',
    async (url) => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: url } }));
      const client = new GeaClientAdapter('https://gea.synear.cn/gea-boot', fetchImpl as typeof fetch);
      await expect(
        client.download(
          'https://gea.synear.cn/gea-boot/api/v1/public/client-releases/download/ticket',
          [],
          new AbortController().signal
        )
      ).rejects.toMatchObject({ code: 'CLIENT_DOWNLOAD_TARGET_INVALID' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );
  it('uses the verified response URL only when filename metadata is absent', () => {
    expect(getGeaPackageExtension('', 'MACOS', `https://${host}/client-release/pkg.dmg?signature=opaque`)).toBe('.dmg');
    expect(getGeaPackageExtension('attachment; filename=test.dmg', 'MACOS')).toBe('.dmg');
    expect(() =>
      getGeaPackageExtension('attachment; filename="test.exe"', 'MACOS', `https://${host}/pkg.dmg`)
    ).toThrow();
    expect(() => getGeaPackageExtension('', 'MACOS', `https://${host}/pkg?filename=test.dmg`)).toThrow();
    expect(() => getGeaPackageExtension("attachment; filename*=UTF-8''%ZZ.dmg", 'MACOS')).toThrow();
  });
});
