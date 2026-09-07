/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  GeaClientError,
  requireSameUploadedPackage,
  getGeaPackageExtension,
  type ClientVersion,
  type GeaClientAdapter,
  type GeaClientRelease,
} from '@/common/adapter/geaClient';

/** A package is only exposed to the existing installer after its content is verified. */
export async function downloadGeaPackage(options: {
  adapter: GeaClientAdapter;
  release: GeaClientRelease;
  version: ClientVersion;
  directory: string;
  allowedHosts: string[];
  signal: AbortSignal;
  onProgress: (received: number, total: number) => void;
}): Promise<string> {
  const { adapter, release, version, directory, signal } = options;
  const fresh = requireSameUploadedPackage(await adapter.check(version, signal), release);
  const response = await adapter.download(
    fresh.downloadUrl!,
    options.allowedHosts,
    AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)])
  );
  let partial: string | undefined;
  try {
    const extension = getGeaPackageExtension(
      response.headers.get('content-disposition') ?? '',
      version.platform,
      response.url
    );
    if (!response.body) throw new GeaClientError('CLIENT_PACKAGE_TYPE_UNAVAILABLE');
    const target = path.join(directory, `GEAUi-${fresh.versionCode}-${randomUUID()}${extension}`);
    partial = target + '.part';
    const checksum = createHash('sha256');
    let bytes = 0;
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length;
          if (bytes > fresh.fileSize!) {
            done(new GeaClientError('CLIENT_PACKAGE_INVALID'));
            return;
          }
          checksum.update(chunk);
          options.onProgress(bytes, fresh.fileSize!);
          done(null, chunk);
        },
      }),
      createWriteStream(partial, { flags: 'wx', mode: 0o600 }),
      { signal }
    );
    if (bytes !== fresh.fileSize || checksum.digest('hex').toLowerCase() !== fresh.sha256.toLowerCase())
      throw new GeaClientError('CLIENT_PACKAGE_INVALID');
    signal.throwIfAborted();
    await rename(partial, target);
    if (signal.aborted) {
      await rm(target, { force: true });
      signal.throwIfAborted();
    }
    return target;
  } finally {
    if (partial) await rm(partial, { force: true });
    await response.body?.cancel().catch(() => {});
  }
}
