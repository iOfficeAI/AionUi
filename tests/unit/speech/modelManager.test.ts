/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  cancelModelDownload,
  getModelStatus,
  getModelStorageDir,
  isModelReady,
} from '@/process/services/speech/modelManager';

describe('modelManager', () => {
  it('computes expected storage dir under models/stt', () => {
    const dir = getModelStorageDir('parakeet-tdt-0.6b-v3-int8');
    expect(dir).toContain('models');
    expect(dir).toContain('stt');
    expect(dir).toContain('parakeet-tdt-0.6b-v3-int8');
  });

  it('returns false for isModelReady when model files are not yet downloaded', async () => {
    const ready = await isModelReady('non-existent-test-model');
    expect(ready).toBe(false);
  });

  it('returns idle status when model is not downloading', () => {
    const status = getModelStatus('parakeet-tdt-0.6b-v3-int8');
    expect(status.status).toBe('idle');
    expect(status.modelId).toBe('parakeet-tdt-0.6b-v3-int8');
    expect(status.totalBytes).toBeGreaterThan(0);
  });

  it('cancelModelDownload returns false when no download is in progress', () => {
    const cancelled = cancelModelDownload('parakeet-tdt-0.6b-v3-int8');
    expect(cancelled).toBe(false);
  });
});
