/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const { isModelReadyMock, mockStream, mockRecognizer, mockSherpa } = vi.hoisted(() => {
  const stream = {
    acceptWaveform: vi.fn(),
    free: vi.fn(),
  };
  const recognizer = {
    createStream: vi.fn(() => stream),
    decode: vi.fn(),
    getResult: vi.fn(() => ({ text: 'Ola mundo' })),
  };
  const sherpa = {
    readWaveFromBinaryData: vi.fn(() => ({
      samples: new Float32Array(16000),
      sampleRate: 16000,
    })),
    createOfflineRecognizer: vi.fn(() => recognizer),
  };
  return {
    isModelReadyMock: vi.fn((_id: string) => Promise.resolve(false)),
    mockStream: stream,
    mockRecognizer: recognizer,
    mockSherpa: sherpa,
  };
});

vi.mock('@/process/services/speech/modelManager', () => ({
  isModelReady: isModelReadyMock,
  getModelStorageDir: vi.fn(() => '/mock/model/dir'),
}));

vi.mock('@/process/services/speech/sherpaLoader', () => ({
  loadSherpaAddon: vi.fn(() => mockSherpa),
}));

import { clearLocalRecognizerCache, transcribeLocalAudio } from '@/process/services/speech/localSpeechService';

describe('localSpeechService', () => {
  it('throws STT_LOCAL_MODEL_NOT_DOWNLOADED if model files are missing', async () => {
    isModelReadyMock.mockResolvedValueOnce(false);
    await expect(transcribeLocalAudio(new Uint8Array([1, 2, 3]), 'parakeet-tdt-0.6b-v3-int8')).rejects.toThrow(
      'STT_LOCAL_MODEL_NOT_DOWNLOADED'
    );
  });

  it('allows clearing local recognizer cache without throwing', () => {
    expect(() => clearLocalRecognizerCache()).not.toThrow();
  });

  it('successfully transcribes audio when model is ready and sherpa is loaded', async () => {
    isModelReadyMock.mockResolvedValueOnce(true);
    clearLocalRecognizerCache();
    const result = await transcribeLocalAudio(new Uint8Array([1, 2, 3, 4]), 'parakeet-tdt-0.6b-v3-int8');

    expect(result.text).toBe('Ola mundo');
    expect(result.provider).toBe('local');
    expect(mockRecognizer.createStream).toHaveBeenCalled();
    expect(mockStream.acceptWaveform).toHaveBeenCalled();
    expect(mockRecognizer.decode).toHaveBeenCalledWith(mockStream);
    expect(mockStream.free).toHaveBeenCalled();
  });
});
