/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export type ClientVersion = {
  platform: 'WINDOWS' | 'MACOS';
  architecture: 'x86_64' | 'arm64';
  versionName: string;
  versionCode: number;
};

const versionCode = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const releaseSchema = z.object({
  upgradeAvailable: z.boolean(),
  mandatory: z.boolean(),
  versionName: z.string().min(1).max(50).nullable(),
  versionCode: versionCode.nullable(),
  releaseNotes: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  distributionType: z.enum(['UPLOAD', 'EXTERNAL_URL']).nullable(),
  fileSize: versionCode.nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable(),
});
export type GeaClientRelease = z.infer<typeof releaseSchema>;

export class GeaClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** GEA business transport. Credentials are supplied only by the trusted host. */
export class GeaClientAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch
  ) {}

  async check(version: ClientVersion, signal?: AbortSignal): Promise<GeaClientRelease> {
    const result = releaseSchema.safeParse(
      await this.post('/api/v1/public/client-releases/check', version, {}, signal)
    );
    if (!result.success) throw new GeaClientError('CLIENT_RESPONSE_INVALID');
    const release = result.data;
    if (
      (release.mandatory && !release.upgradeAvailable) ||
      (release.upgradeAvailable &&
        (release.versionCode === null ||
          release.versionCode <= version.versionCode ||
          !release.versionName ||
          !release.downloadUrl ||
          !release.distributionType))
    ) {
      throw new GeaClientError('CLIENT_RESPONSE_INVALID');
    }
    if (release.downloadUrl) {
      const url = new URL(release.downloadUrl, this.baseUrl + '/');
      const base = new URL(this.baseUrl);
      if (
        url.origin !== base.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/api/v1/public/client-releases/download/')
      ) {
        throw new GeaClientError('CLIENT_RESPONSE_INVALID');
      }
      release.downloadUrl = url.toString();
    }
    return release;
  }

  async heartbeat(
    version: ClientVersion,
    deviceInstanceId: string,
    credential: { accessToken: string; tenantId: string },
    signal?: AbortSignal
  ): Promise<number> {
    const result = z
      .object({ heartbeatIntervalSeconds: z.number().int().positive().max(2147483) })
      .safeParse(
        await this.post(
          '/api/v1/client/devices/heartbeat',
          { ...version, deviceInstanceId },
          { 'X-Access-Token': credential.accessToken, 'X-Tenant-Id': credential.tenantId },
          signal
        )
      );
    if (!result.success) throw new GeaClientError('CLIENT_RESPONSE_INVALID');
    return result.data.heartbeatIntervalSeconds;
  }

  async download(url: string, allowedHosts: string[], signal: AbortSignal): Promise<Response> {
    const base = new URL(this.baseUrl);
    let target = new URL(url);
    for (let redirects = 0; redirects <= 5; redirects++) {
      const sameOrigin = target.origin === base.origin;
      if (
        target.username ||
        target.password ||
        target.hash ||
        (!sameOrigin && (target.protocol !== 'https:' || !allowedHosts.includes(target.hostname)))
      ) {
        throw new GeaClientError('CLIENT_DOWNLOAD_TARGET_INVALID');
      }
      const response = await this.fetchImpl(target.toString(), { redirect: 'manual', credentials: 'omit', signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new GeaClientError('CLIENT_DOWNLOAD_TARGET_INVALID');
        target = new URL(location, target);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new GeaClientError('CLIENT_DOWNLOAD_FAILED');
      }
      return response;
    }
    throw new GeaClientError('CLIENT_DOWNLOAD_TARGET_INVALID');
  }

  private async post(
    endpoint: string,
    body: unknown,
    headers: Record<string, string>,
    signal?: AbortSignal
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        redirect: 'error',
        credentials: 'omit',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      });
    } catch {
      throw new GeaClientError('CLIENT_NETWORK_ERROR');
    }
    if (response.status === 401 || response.status === 403) throw new GeaClientError('CLIENT_AUTH_REQUIRED');
    if (!response.ok) throw new GeaClientError('CLIENT_SERVICE_ERROR');
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GeaClientError('CLIENT_RESPONSE_INVALID');
    }
    const envelope = z
      .object({
        success: z.boolean(),
        code: z.number().optional(),
        errorCode: z.string().nullish(),
        result: z.unknown(),
      })
      .safeParse(value);
    if (!envelope.success) throw new GeaClientError('CLIENT_RESPONSE_INVALID');
    if (!envelope.data.success) {
      if (envelope.data.code === 401 || envelope.data.code === 403) throw new GeaClientError('CLIENT_AUTH_REQUIRED');
      const code = envelope.data.errorCode;
      throw new GeaClientError(
        code === 'CLIENT_REQUEST_INVALID' || code === 'CLIENT_STATE_INVALID' ? code : 'CLIENT_SERVICE_ERROR'
      );
    }
    return envelope.data.result;
  }
}

/** Validate refreshed release metadata before admitting bytes to the installer. */
export function requireSameUploadedPackage(
  fresh: GeaClientRelease,
  expected: GeaClientRelease
): GeaClientRelease & { sha256: string; fileSize: number } {
  if (
    !fresh.upgradeAvailable ||
    fresh.versionCode !== expected.versionCode ||
    fresh.sha256 !== expected.sha256 ||
    fresh.fileSize !== expected.fileSize ||
    fresh.distributionType !== 'UPLOAD' ||
    !fresh.sha256 ||
    !fresh.fileSize
  ) {
    throw new GeaClientError('CLIENT_RELEASE_CHANGED');
  }
  return { ...fresh, sha256: fresh.sha256, fileSize: fresh.fileSize };
}

export function getGeaPackageExtension(disposition: string, platform: ClientVersion['platform']): string {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : disposition.match(/filename="([^"]+)"/i)?.[1];
  const extension = name?.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase();
  if (!extension || !(platform === 'MACOS' ? ['.dmg', '.pkg'] : ['.exe', '.msi']).includes(extension)) {
    throw new GeaClientError('CLIENT_PACKAGE_TYPE_UNAVAILABLE');
  }
  return extension;
}
