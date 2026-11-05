/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    readWaveFromBinary: vi.fn((buf: Buffer) => ({
      samples: new Float32Array(16000),
      sampleRate: 16000,
    })),
    readWaveFromBinaryData: vi.fn((buf: Buffer) => ({
      samples: new Float32Array(16000),
      sampleRate: 16000,
    })),
    createOfflineRecognizer: vi.fn(() => recognizer),
    createOfflineStream: vi.fn(() => ({})),
    acceptWaveformOffline: vi.fn(),
    decodeOfflineStream: vi.fn(),
    getOfflineStreamResultAsJson: vi.fn(() => JSON.stringify({ text: 'Native result' })),
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
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalRecognizerCache();
    mockRecognizer.createStream = vi.fn(() => mockStream);
    mockRecognizer.getResult = vi.fn(() => ({ text: 'Ola mundo' }));
    mockSherpa.readWaveFromBinary = vi.fn(() => ({
      samples: new Float32Array(16000),
      sampleRate: 16000,
    }));
  });

  it('throws STT_LOCAL_MODEL_NOT_DOWNLOADED if model files are missing', async () => {
    isModelReadyMock.mockResolvedValueOnce(false);
    await expect(transcribeLocalAudio(new Uint8Array([1, 2, 3]), 'parakeet-tdt-0.6b-v3-int8')).rejects.toThrow(
      'STT_LOCAL_MODEL_NOT_DOWNLOADED'
    );
  });

  it('allows clearing local recognizer cache without throwing', () => {
    expect(() => clearLocalRecognizerCache()).not.toThrow();
  });

  it('successfully transcribes audio with Uint8Array and reuses cached recognizer on second call', async () => {
    isModelReadyMock.mockResolvedValue(true);

    const result1 = await transcribeLocalAudio(new Uint8Array([1, 2, 3, 4]), 'parakeet-tdt-0.6b-v3-int8');
    expect(result1.text).toBe('Ola mundo');
    expect(result1.provider).toBe('local');
    expect(mockSherpa.createOfflineRecognizer).toHaveBeenCalledTimes(1);

    // Second call should reuse activeRecognizerCache
    const result2 = await transcribeLocalAudio(Buffer.from([1, 2, 3, 4]), 'parakeet-tdt-0.6b-v3-int8');
    expect(result2.text).toBe('Ola mundo');
    expect(mockSherpa.createOfflineRecognizer).toHaveBeenCalledTimes(1);
  });

  it('handles number array and object record inputs to toBuffer', async () => {
    isModelReadyMock.mockResolvedValue(true);

    const arrayInput = [0, 1, 2, 3];
    const resArray = await transcribeLocalAudio(arrayInput, 'parakeet-tdt-0.6b-v3-int8');
    expect(resArray.text).toBe('Ola mundo');

    const recordInput = { 0: 10, 1: 20, 2: 30 };
    const resRecord = await transcribeLocalAudio(recordInput as any, 'parakeet-tdt-0.6b-v3-int8');
    expect(resRecord.text).toBe('Ola mundo');
  });

  it('handles string JSON result in recognizer.getResult', async () => {
    isModelReadyMock.mockResolvedValue(true);
    mockRecognizer.getResult = vi.fn(() => JSON.stringify({ text: 'Parsed string result' }));

    const result = await transcribeLocalAudio(new Uint8Array([1, 2, 3, 4]), 'parakeet-tdt-0.6b-v3-int8');
    expect(result.text).toBe('Parsed string result');
  });

  it('falls back to raw 16-bit PCM conversion when wave parsing throws', async () => {
    isModelReadyMock.mockResolvedValue(true);
    mockSherpa.readWaveFromBinary = vi.fn(() => {
      throw new Error('Not a WAV header');
    });

    // Create 100 bytes of 16-bit PCM
    const pcm = new Int16Array(50);
    for (let i = 0; i < 50; i++) pcm[i] = i * 100;
    const rawBytes = new Uint8Array(pcm.buffer);

    const result = await transcribeLocalAudio(rawBytes, 'parakeet-tdt-0.6b-v3-int8');
    expect(result.text).toBe('Ola mundo');
    expect(mockStream.acceptWaveform).toHaveBeenCalledWith(16000, expect.any(Float32Array));
  });

  it('supports native C++ NAPI addon interface when recognizer.createStream is absent', async () => {
    isModelReadyMock.mockResolvedValue(true);
    // Remove createStream to exercise native addon path
    delete (mockRecognizer as any).createStream;

    const result = await transcribeLocalAudio(new Uint8Array([1, 2, 3, 4]), 'parakeet-tdt-0.6b-v3-int8');
    expect(result.text).toBe('Native result');
    expect(mockSherpa.createOfflineStream).toHaveBeenCalledWith(mockRecognizer);
    expect(mockSherpa.acceptWaveformOffline).toHaveBeenCalled();
    expect(mockSherpa.decodeOfflineStream).toHaveBeenCalled();
    expect(mockSherpa.getOfflineStreamResultAsJson).toHaveBeenCalled();
  });
});
