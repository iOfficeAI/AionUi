/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as speechServices from '@/process/services/speech';

describe('services/speech index exports', () => {
  it('exports expected service functions and catalogs', () => {
    expect(speechServices.LOCAL_SPEECH_MODELS).toBeDefined();
    expect(typeof speechServices.getLocalSpeechModelManifest).toBe('function');
    expect(typeof speechServices.getSherpaPackageName).toBe('function');
    expect(typeof speechServices.loadSherpaAddon).toBe('function');
    expect(typeof speechServices.isSherpaSupported).toBe('function');
    expect(typeof speechServices.getModelStorageDir).toBe('function');
    expect(typeof speechServices.isModelReady).toBe('function');
    expect(typeof speechServices.getModelStatus).toBe('function');
    expect(typeof speechServices.downloadModel).toBe('function');
    expect(typeof speechServices.cancelModelDownload).toBe('function');
    expect(typeof speechServices.transcribeLocalAudio).toBe('function');
    expect(typeof speechServices.clearLocalRecognizerCache).toBe('function');
  });
});
