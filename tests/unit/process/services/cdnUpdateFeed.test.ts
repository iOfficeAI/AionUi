/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdater } from 'electron-updater/out/AppUpdater';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';
import { CdnGenericProvider } from '@/process/services/cdnGenericProvider';
import {
  buildUpdateFeedOptions,
  normalizeInternalUpdateBaseUrl,
  parseRegistryQueryValue,
  resolveUpdateSourceConfig,
  shouldFallbackToGitHub,
} from '@/process/services/updateFeed';

const makeRuntimeOptions = (): ProviderRuntimeOptions => ({
  isUseMultipleRangeRequest: true,
  platform: 'win32',
  executor: { request: vi.fn() } as unknown as ProviderRuntimeOptions['executor'],
});

describe('update source policy', () => {
  it('uses GitHub Releases by default', () => {
    expect(
      resolveUpdateSourceConfig({
        isPackaged: true,
        platform: 'win32',
        manifestPublicKey: 'public-key',
        readPolicyValue: () => undefined,
      })
    ).toEqual({
      kind: 'github',
      owner: 'suoak',
      repo: 'AionUi',
      manifestPublicKey: 'public-key',
    });
  });

  it('ignores environment source overrides in packaged applications', () => {
    expect(
      resolveUpdateSourceConfig({
        isPackaged: true,
        platform: 'win32',
        env: {
          CSBU_WORKMATE_UPDATE_SOURCE: 'internal-http',
          CSBU_WORKMATE_UPDATE_BASE_URL: 'http://10.20.30.40/releases',
        },
        manifestPublicKey: 'public-key',
        readPolicyValue: () => undefined,
      })
    ).toEqual({ kind: 'github', owner: 'suoak', repo: 'AionUi', manifestPublicKey: 'public-key' });
  });

  it('accepts an internal RFC1918 HTTP policy with a fixed path', () => {
    const values = { UpdateSource: 'internal-http', UpdateBaseUrl: 'http://10.20.30.40:8080/releases/' };
    expect(
      resolveUpdateSourceConfig({
        isPackaged: true,
        platform: 'win32',
        manifestPublicKey: 'public-key',
        readPolicyValue: (name) => values[name],
      })
    ).toEqual({
      kind: 'internal-http',
      baseUrl: 'http://10.20.30.40:8080/releases',
      fallback: 'github',
      manifestPublicKey: 'public-key',
    });
  });

  it('rejects an unknown configured update source instead of bypassing policy', () => {
    expect(() =>
      resolveUpdateSourceConfig({
        isPackaged: true,
        platform: 'win32',
        readPolicyValue: (name) => (name === 'UpdateSource' ? 'internal-https' : undefined),
      })
    ).toThrow('Unsupported update source policy');
  });

  it.each([
    'https://10.20.30.40/releases',
    'http://8.8.8.8/releases',
    'http://updates.internal/releases',
    'http://10.1/releases',
    'http://0x0a000001/releases',
    'http://user:pass@10.20.30.40/releases',
    'http://10.20.30.40/',
  ])('rejects unsafe internal source %s', (url) => {
    expect(() => normalizeInternalUpdateBaseUrl(url)).toThrow();
  });

  it('parses policy values from reg.exe output', () => {
    expect(
      parseRegistryQueryValue(
        String.raw`HKEY_LOCAL_MACHINE\Software\Policies\CSBU\CSBU WorkMate
    UpdateBaseUrl    REG_SZ    http://192.168.1.20/releases`,
        'UpdateBaseUrl'
      )
    ).toBe('http://192.168.1.20/releases');
  });

  it('builds the signed provider for an internal source', () => {
    const options = buildUpdateFeedOptions({
      kind: 'internal-http',
      baseUrl: 'http://172.16.0.5/releases',
      fallback: 'github',
      manifestPublicKey: 'public-key',
    });
    expect(options.provider).toBe('custom');
    expect(options.updateProvider).toBe(CdnGenericProvider);
  });

  it('builds the signed provider against the GitHub release root', () => {
    const options = buildUpdateFeedOptions({
      kind: 'github',
      owner: 'suoak',
      repo: 'AionUi',
      manifestPublicKey: 'public-key',
    });

    expect(options).toMatchObject({
      provider: 'custom',
      url: 'https://github.com/suoak/AionUi/releases/latest/download',
      sourceKind: 'github',
      artifactPathMode: 'release-root',
      manifestPublicKey: 'public-key',
      updateProvider: CdnGenericProvider,
    });
  });

  it('rejects every update source when the manifest verification key is missing', () => {
    expect(() =>
      resolveUpdateSourceConfig({ isPackaged: true, platform: 'win32', readPolicyValue: () => undefined })
    ).toThrow('Update manifest public key is not configured');
  });

  it('falls back only for unavailable internal sources, never integrity failures', () => {
    const source = {
      kind: 'internal-http' as const,
      baseUrl: 'http://10.20.30.40/releases',
      fallback: 'github' as const,
      manifestPublicKey: 'public-key',
    };
    expect(shouldFallbackToGitHub(source, { code: 'ECONNREFUSED' })).toBe(true);
    expect(shouldFallbackToGitHub(source, { statusCode: 404 })).toBe(true);
    expect(shouldFallbackToGitHub(source, { code: 'ERR_UPDATER_MANIFEST_SIGNATURE_INVALID' })).toBe(false);
    expect(shouldFallbackToGitHub(source, { code: 'ERR_UPDATER_REDIRECT_REJECTED' })).toBe(false);
    expect(shouldFallbackToGitHub(source, new Error('sha512 checksum mismatch'))).toBe(false);
  });
});

describe('signed internal update provider', () => {
  const manifest = [
    'version: 2.1.52',
    'files:',
    '  - url: CSBU-WorkMate-2.1.52-win-x64.exe',
    '    sha512: c2hhNTEy',
    'path: CSBU-WorkMate-2.1.52-win-x64.exe',
    'sha512: c2hhNTEy',
    'releaseDate: 2026-08-06T00:00:00.000Z',
    '',
  ].join('\n');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

  class TestProvider extends CdnGenericProvider {
    constructor(private readonly signature: string) {
      super(
        {
          provider: 'custom',
          url: 'http://10.0.0.5/releases',
          sourceKind: 'internal-http',
          artifactPathMode: 'version-directory',
          manifestPublicKey: publicKeyPem,
        },
        { channel: 'latest' } as AppUpdater,
        makeRuntimeOptions()
      );
    }

    protected override requestInternalResource(url: URL): Promise<string> {
      return Promise.resolve(url.pathname.endsWith('.sig') ? this.signature : manifest);
    }
  }

  class TestGitHubProvider extends CdnGenericProvider {
    constructor(private readonly signature: string) {
      super(
        {
          provider: 'custom',
          url: 'https://github.com/suoak/AionUi/releases/latest/download',
          sourceKind: 'github',
          artifactPathMode: 'release-root',
          manifestPublicKey: publicKeyPem,
        },
        { channel: 'latest' } as AppUpdater,
        makeRuntimeOptions()
      );
    }

    protected override requestInternalResource(url: URL): Promise<string> {
      return Promise.resolve(url.pathname.endsWith('.sig') ? this.signature : manifest);
    }
  }

  it('accepts a correctly signed manifest and resolves artifacts below its version directory', async () => {
    const signature = sign(null, Buffer.from(manifest), privateKey).toString('base64');
    const provider = new TestProvider(signature);
    const updateInfo = await provider.getLatestVersion();
    const files = provider.resolveFiles(updateInfo);

    expect(updateInfo.version).toBe('2.1.52');
    expect(files[0]?.url.href).toBe('http://10.0.0.5/releases/2.1.52/CSBU-WorkMate-2.1.52-win-x64.exe');
  });

  it('rejects a tampered manifest signature', async () => {
    const provider = new TestProvider(Buffer.from('invalid-signature').toString('base64'));
    await expect(provider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_MANIFEST_SIGNATURE_INVALID',
    });
  });

  it('verifies GitHub metadata and resolves artifacts from the release root', async () => {
    const signature = sign(null, Buffer.from(manifest), privateKey).toString('base64');
    const provider = new TestGitHubProvider(signature);
    const updateInfo = await provider.getLatestVersion();
    const files = provider.resolveFiles(updateInfo);

    expect(files[0]?.url.href).toBe(
      'https://github.com/suoak/AionUi/releases/latest/download/CSBU-WorkMate-2.1.52-win-x64.exe'
    );
  });

  it('rejects a manifest redirect to another origin', async () => {
    const signature = sign(null, Buffer.from(manifest), privateKey).toString('base64');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('.sig')) return new Response(signature, { status: 200 });
        return new Response(null, {
          status: 302,
          headers: { location: 'http://10.0.0.6/releases/latest.yml' },
        });
      })
    );

    try {
      const provider = new CdnGenericProvider(
        {
          provider: 'custom',
          url: 'http://10.0.0.5/releases',
          sourceKind: 'internal-http',
          artifactPathMode: 'version-directory',
          manifestPublicKey: publicKeyPem,
        },
        { channel: 'latest' } as AppUpdater,
        makeRuntimeOptions()
      );
      await expect(provider.getLatestVersion()).rejects.toMatchObject({ code: 'ERR_UPDATER_REDIRECT_REJECTED' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
