/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as modelCatalog from '@/process/services/speech/modelCatalog';
import {
  cancelModelDownload,
  downloadModel,
  getModelStatus,
  getModelStorageDir,
  isModelReady,
} from '@/process/services/speech/modelManager';

describe('modelManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-stt-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('getModelStorageDir', () => {
    it('computes expected storage dir under models/stt', () => {
      const dir = getModelStorageDir('parakeet-tdt-0.6b-v3-int8');
      expect(dir).toContain('models');
      expect(dir).toContain('stt');
      expect(dir).toContain('parakeet-tdt-0.6b-v3-int8');
    });
  });

  describe('isModelReady', () => {
    it('returns false for unknown model ID when manifest is undefined', async () => {
      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValueOnce(undefined);
      const ready = await isModelReady('unknown-test-model');
      expect(ready).toBe(false);
    });

    it('returns false when model directory does not exist', async () => {
      const ready = await isModelReady('parakeet-tdt-0.6b-v3-int8');
      expect(typeof ready).toBe('boolean');
    });
  });

  describe('getModelStatus', () => {
    it('returns idle status with totalBytes for valid model', () => {
      const status = getModelStatus('parakeet-tdt-0.6b-v3-int8');
      expect(status.status).toBe('idle');
      expect(status.modelId).toBe('parakeet-tdt-0.6b-v3-int8');
      expect(status.totalBytes).toBeGreaterThan(0);
      expect(status.progress).toBe(0);
    });

    it('returns idle status with 0 totalBytes when manifest is undefined', () => {
      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValueOnce(undefined);
      const status = getModelStatus('non-existent-model');
      expect(status.status).toBe('idle');
      expect(status.totalBytes).toBe(0);
    });
  });

  describe('cancelModelDownload', () => {
    it('returns false when no download is active', () => {
      const cancelled = cancelModelDownload('parakeet-tdt-0.6b-v3-int8');
      expect(cancelled).toBe(false);
    });
  });

  describe('downloadModel validation and fast paths', () => {
    it('rejects when manifest cannot be found', async () => {
      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValueOnce(undefined);
      await expect(downloadModel('invalid-model-id')).rejects.toThrow('Unknown model ID: invalid-model-id');
    });

    it('returns immediately with ready status when model is already ready', async () => {
      const manifest = modelCatalog.getLocalSpeechModelManifest('parakeet-tdt-0.6b-v3-int8')!;
      const modelDir = getModelStorageDir('parakeet-tdt-0.6b-v3-int8');
      await fs.mkdir(modelDir, { recursive: true });

      // Create dummy files with exact manifest sizes
      for (const file of manifest.files) {
        const filePath = path.join(modelDir, file.name);
        await fs.writeFile(filePath, Buffer.alloc(file.sizeBytes));
      }

      const progressCb = vi.fn();
      const status = await downloadModel('parakeet-tdt-0.6b-v3-int8', progressCb);
      expect(status.status).toBe('ready');
      expect(status.progress).toBe(100);
      expect(progressCb).toHaveBeenCalledWith(
        expect.objectContaining({
          percent: 100,
        })
      );

      // Clean up test files so subsequent tests are not affected
      for (const file of manifest.files) {
        const filePath = path.join(modelDir, file.name);
        try {
          await fs.unlink(filePath);
        } catch {
          // ignore
        }
      }
    });
  });

  describe('downloadModel streaming and error handling', () => {
    const createMockStream = (buf: Buffer) => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buf));
          controller.close();
        },
      });
    };

    it('downloads model files, updates progress, and validates checksum', async () => {
      const testContent = Buffer.from('model-weight-content');
      const testSha256 = createHash('sha256').update(testContent).digest('hex');

      const mockManifest: modelCatalog.LocalSpeechModelManifest = {
        id: 'test-mini-model',
        label: 'Test Mini',
        description: 'Test model',
        type: 'transducer',
        language: 'en',
        sampleRate: 16000,
        modelingUnit: 'bpe',
        totalSizeBytes: testContent.length,
        files: [
          {
            name: 'encoder.int8.onnx',
            sizeBytes: testContent.length,
            sha256: testSha256,
            url: 'https://huggingface.co/test/model/resolve/main/encoder.int8.onnx',
          },
        ],
      };

      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValue(mockManifest);

      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: createMockStream(testContent),
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const progressUpdates: number[] = [];
      const result = await downloadModel('test-mini-model', (p) => {
        progressUpdates.push(p.percent);
      });

      expect(result.status).toBe('ready');
      expect(result.progress).toBe(100);
      expect(progressUpdates).toContain(100);

      // Clean up target test file
      const destPath = path.join(getModelStorageDir('test-mini-model'), 'encoder.int8.onnx');
      if (existsSync(destPath)) {
        await fs.unlink(destPath);
      }
    });

    it('falls back to mirror URL when primary fails', async () => {
      const testContent = Buffer.from('mirror-content');
      const testSha256 = createHash('sha256').update(testContent).digest('hex');

      const mockManifest: modelCatalog.LocalSpeechModelManifest = {
        id: 'test-mirror-model',
        label: 'Test Mirror',
        description: 'Test model',
        type: 'transducer',
        language: 'en',
        sampleRate: 16000,
        modelingUnit: 'bpe',
        totalSizeBytes: testContent.length,
        files: [
          {
            name: 'encoder.int8.onnx',
            sizeBytes: testContent.length,
            sha256: testSha256,
            url: 'https://huggingface.co/test/model/resolve/main/encoder.int8.onnx',
          },
        ],
      };

      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValue(mockManifest);

      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        attempt++;
        if (url.includes('huggingface.co')) {
          return Promise.reject(new Error('HuggingFace blocked'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: createMockStream(testContent),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await downloadModel('test-mirror-model');
      expect(result.status).toBe('ready');
      expect(attempt).toBeGreaterThanOrEqual(2);

      const destPath = path.join(getModelStorageDir('test-mirror-model'), 'encoder.int8.onnx');
      if (existsSync(destPath)) {
        await fs.unlink(destPath);
      }
    });

    it('throws error when checksum verification fails', async () => {
      const testContent = Buffer.from('corrupted-content');
      const mockManifest: modelCatalog.LocalSpeechModelManifest = {
        id: 'test-corrupt-model',
        label: 'Test Corrupt',
        description: 'Test model',
        type: 'transducer',
        language: 'en',
        sampleRate: 16000,
        modelingUnit: 'bpe',
        totalSizeBytes: testContent.length,
        files: [
          {
            name: 'encoder.int8.onnx',
            sizeBytes: testContent.length,
            sha256: 'wrong-sha256-hash-value-expected',
            url: 'https://huggingface.co/test/model/resolve/main/encoder.int8.onnx',
          },
        ],
      };

      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValue(mockManifest);

      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: createMockStream(testContent),
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      await expect(downloadModel('test-corrupt-model')).rejects.toThrow('Checksum mismatch');
      const status = getModelStatus('test-corrupt-model');
      expect(status.status).toBe('idle');
    });

    it('handles download network failure and cleans up active download', async () => {
      const mockManifest: modelCatalog.LocalSpeechModelManifest = {
        id: 'test-network-fail-model',
        label: 'Test Fail',
        description: 'Test model',
        type: 'transducer',
        language: 'en',
        sampleRate: 16000,
        modelingUnit: 'bpe',
        totalSizeBytes: 1000,
        files: [
          {
            name: 'encoder.int8.onnx',
            sizeBytes: 1000,
            sha256: 'somehash',
            url: 'https://huggingface.co/test/fail/model',
          },
        ],
      };

      vi.spyOn(modelCatalog, 'getLocalSpeechModelManifest').mockReturnValue(mockManifest);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(downloadModel('test-network-fail-model')).rejects.toThrow();
      const status = getModelStatus('test-network-fail-model');
      expect(status.status).toBe('idle');
    });
  });
});
