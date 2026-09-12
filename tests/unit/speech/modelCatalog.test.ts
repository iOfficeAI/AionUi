/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getLocalSpeechModelManifest, LOCAL_SPEECH_MODELS } from '@/process/services/speech/modelCatalog';

describe('modelCatalog', () => {
  it('contains Parakeet TDT v3 as recommended model', () => {
    const v3 = getLocalSpeechModelManifest('parakeet-tdt-0.6b-v3-int8');
    expect(v3).toBeDefined();
    expect(v3?.id).toBe('parakeet-tdt-0.6b-v3-int8');
    expect(v3?.label).toBe('Parakeet TDT v3');
    expect(v3?.recommended).toBe(true);
    expect(v3?.language).toBe('multilingual');
    expect(v3?.sampleRate).toBe(16000);
  });

  it('contains Parakeet TDT v2 model', () => {
    const v2 = getLocalSpeechModelManifest('parakeet-tdt-0.6b-v2-int8');
    expect(v2).toBeDefined();
    expect(v2?.id).toBe('parakeet-tdt-0.6b-v2-int8');
    expect(v2?.label).toBe('Parakeet TDT v2');
    expect(v2?.language).toBe('en');
  });

  it('has valid download file specifications for Parakeet TDT v3', () => {
    const v3 = getLocalSpeechModelManifest('parakeet-tdt-0.6b-v3-int8')!;
    const fileNames = v3.files.map((f) => f.name);
    expect(fileNames).toContain('encoder.int8.onnx');
    expect(fileNames).toContain('decoder.int8.onnx');
    expect(fileNames).toContain('joiner.int8.onnx');
    expect(fileNames).toContain('tokens.txt');

    for (const file of v3.files) {
      expect(file.url).toContain('huggingface.co');
      expect(file.sha256).toHaveLength(64);
      expect(file.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('falls back to recommended model when unknown id is passed', () => {
    const unknown = getLocalSpeechModelManifest('non-existent-model');
    expect(unknown).toBe(LOCAL_SPEECH_MODELS[0]);
  });
});
