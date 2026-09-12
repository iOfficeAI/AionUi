/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { SpeechModelDownloadStatus } from '@/common/types/provider/speech';
import { getLocalSpeechModelManifest } from './modelCatalog';
import type { ModelDownloadProgressCallback, SpeechModelFileSpec } from './types';

function getStorageBaseDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    const electronApp = electron?.app || electron;
    if (typeof electronApp?.getPath === 'function') {
      return electronApp.getPath('userData');
    }
  } catch {
    // Electron app may not be initialized in tests or worker threads
  }
  return path.join(os.homedir(), '.aionui');
}

export function getModelStorageDir(modelId: string): string {
  return path.join(getStorageBaseDir(), 'models', 'stt', modelId);
}

async function verifyFileSha256(filePath: string, expectedSha256: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  return new Promise<boolean>((resolve) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const digest = hash.digest('hex');
      resolve(digest.toLowerCase() === expectedSha256.toLowerCase());
    });
    stream.on('error', () => resolve(false));
  });
}

export async function isModelReady(modelId: string): Promise<boolean> {
  const manifest = getLocalSpeechModelManifest(modelId);
  if (!manifest) return false;

  const modelDir = getModelStorageDir(modelId);
  if (!existsSync(modelDir)) return false;

  for (const file of manifest.files) {
    const filePath = path.join(modelDir, file.name);
    if (!existsSync(filePath)) return false;
    try {
      const stat = await fs.stat(filePath);
      if (stat.size !== file.sizeBytes) return false;
    } catch {
      return false;
    }
  }

  return true;
}

const activeDownloads = new Map<string, { abortController: AbortController; progress: SpeechModelDownloadStatus }>();

export function getModelStatus(modelId: string): SpeechModelDownloadStatus {
  const active = activeDownloads.get(modelId);
  if (active) {
    return active.progress;
  }
  const manifest = getLocalSpeechModelManifest(modelId);
  const totalBytes = manifest?.totalSizeBytes ?? 0;
  return {
    modelId,
    status: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes,
  };
}

const DOWNLOAD_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function downloadSingleFile(
  spec: SpeechModelFileSpec,
  destPath: string,
  onChunk: (bytesRead: number) => void,
  signal: AbortSignal
): Promise<void> {
  const tmpPath = `${destPath}.tmp`;
  const primaryUrl = spec.url;
  const mirrorUrl = spec.url.replace('https://huggingface.co/', 'https://hf-mirror.com/');

  let response: Response | null = null;
  try {
    response = await fetch(primaryUrl, { signal, headers: { 'User-Agent': DOWNLOAD_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
  } catch (primaryError) {
    // Try fallback mirror
    try {
      response = await fetch(mirrorUrl, { signal, headers: { 'User-Agent': DOWNLOAD_USER_AGENT } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`, { cause: primaryError });
      }
    } catch {
      throw new Error(`Failed to download ${spec.name} from primary and mirror: ${String(primaryError)}`);
    }
  }

  if (!response.body) {
    throw new Error(`Empty response body for ${spec.name}`);
  }

  const fileStream = createWriteStream(tmpPath);
  const nodeReadable = Readable.fromWeb(response.body as any);

  nodeReadable.on('data', (chunk: Buffer) => {
    onChunk(chunk.length);
  });

  try {
    await pipeline(nodeReadable, fileStream);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }

  // Verify sha256
  const isValid = await verifyFileSha256(tmpPath, spec.sha256);
  if (!isValid) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw new Error(`Checksum mismatch for file ${spec.name}`);
  }

  await fs.rename(tmpPath, destPath);
}

export async function downloadModel(
  modelId: string,
  onProgress?: ModelDownloadProgressCallback
): Promise<SpeechModelDownloadStatus> {
  const manifest = getLocalSpeechModelManifest(modelId);
  if (!manifest) {
    throw new Error(`Unknown model ID: ${modelId}`);
  }

  if (await isModelReady(modelId)) {
    const readyStatus: SpeechModelDownloadStatus = {
      modelId,
      status: 'ready',
      progress: 100,
      downloadedBytes: manifest.totalSizeBytes,
      totalBytes: manifest.totalSizeBytes,
    };
    onProgress?.({
      modelId,
      percent: 100,
      downloadedBytes: manifest.totalSizeBytes,
      totalBytes: manifest.totalSizeBytes,
    });
    return readyStatus;
  }

  if (activeDownloads.has(modelId)) {
    return activeDownloads.get(modelId)!.progress;
  }

  const abortController = new AbortController();
  const progressStatus: SpeechModelDownloadStatus = {
    modelId,
    status: 'downloading',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: manifest.totalSizeBytes,
  };

  activeDownloads.set(modelId, { abortController, progress: progressStatus });

  const modelDir = getModelStorageDir(modelId);
  await fs.mkdir(modelDir, { recursive: true });

  let cumulativeBytes = 0;

  try {
    for (const file of manifest.files) {
      const destPath = path.join(modelDir, file.name);

      // Check if this specific file already exists and is valid
      if (existsSync(destPath)) {
        const stat = await fs.stat(destPath);
        if (stat.size === file.sizeBytes) {
          cumulativeBytes += file.sizeBytes;
          progressStatus.downloadedBytes = cumulativeBytes;
          progressStatus.progress = Math.round((cumulativeBytes / manifest.totalSizeBytes) * 100);
          onProgress?.({
            modelId,
            percent: progressStatus.progress,
            downloadedBytes: cumulativeBytes,
            totalBytes: manifest.totalSizeBytes,
          });
          continue;
        }
      }

      await downloadSingleFile(
        file,
        destPath,
        (bytesRead) => {
          cumulativeBytes += bytesRead;
          progressStatus.downloadedBytes = cumulativeBytes;
          progressStatus.progress = Math.min(99, Math.round((cumulativeBytes / manifest.totalSizeBytes) * 100));
          onProgress?.({
            modelId,
            percent: progressStatus.progress,
            downloadedBytes: cumulativeBytes,
            totalBytes: manifest.totalSizeBytes,
          });
        },
        abortController.signal
      );
    }

    progressStatus.status = 'ready';
    progressStatus.progress = 100;
    progressStatus.downloadedBytes = manifest.totalSizeBytes;

    onProgress?.({
      modelId,
      percent: 100,
      downloadedBytes: manifest.totalSizeBytes,
      totalBytes: manifest.totalSizeBytes,
    });

    return progressStatus;
  } catch (error) {
    progressStatus.status = 'error';
    progressStatus.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    activeDownloads.delete(modelId);
  }
}

export function cancelModelDownload(modelId: string): boolean {
  const active = activeDownloads.get(modelId);
  if (active) {
    active.abortController.abort();
    activeDownloads.delete(modelId);
    return true;
  }
  return false;
}
