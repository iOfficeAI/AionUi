/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { SpeechToTextResult } from '@/common/types/provider/speech';
import { getLocalSpeechModelManifest } from './modelCatalog';
import { getModelStorageDir, isModelReady } from './modelManager';
import { loadSherpaAddon } from './sherpaLoader';

type CachedRecognizer = {
  modelId: string;
  recognizer: any;
};

let activeRecognizerCache: CachedRecognizer | null = null;

function getOrInitRecognizer(modelId: string, sherpa: any): any {
  if (activeRecognizerCache && activeRecognizerCache.modelId === modelId) {
    return activeRecognizerCache.recognizer;
  }

  const manifest = getLocalSpeechModelManifest(modelId);
  if (!manifest) {
    throw new Error(`STT_UNKNOWN_MODEL: ${modelId}`);
  }

  const modelDir = getModelStorageDir(modelId);
  const encoderPath = path.join(modelDir, 'encoder.int8.onnx');
  const decoderPath = path.join(modelDir, 'decoder.int8.onnx');
  const joinerPath = path.join(modelDir, 'joiner.int8.onnx');
  const tokensPath = path.join(modelDir, 'tokens.txt');

  const config = {
    decodingMethod: 'greedy_search',
    featConfig: {
      featureDim: 80,
      sampleRate: manifest.sampleRate,
    },
    modelConfig: {
      debug: 0,
      numThreads: 4,
      provider: 'cpu',
      tokens: tokensPath,
      transducer: {
        decoder: decoderPath,
        encoder: encoderPath,
        joiner: joinerPath,
      },
    },
  };

  const recognizer = sherpa.createOfflineRecognizer(config);
  activeRecognizerCache = {
    modelId,
    recognizer,
  };

  return recognizer;
}

function toBuffer(audioBytes: Uint8Array | Buffer | number[] | Record<string, number>): Buffer {
  if (Buffer.isBuffer(audioBytes)) {
    return audioBytes;
  }
  if (audioBytes instanceof Uint8Array) {
    return Buffer.from(audioBytes.buffer, audioBytes.byteOffset, audioBytes.byteLength);
  }
  if (Array.isArray(audioBytes)) {
    return Buffer.from(audioBytes);
  }
  if (typeof audioBytes === 'object' && audioBytes !== null) {
    const keys = Object.keys(audioBytes);
    const buf = Buffer.alloc(keys.length);
    for (let i = 0; i < keys.length; i++) {
      buf[i] = (audioBytes as Record<string, number>)[i];
    }
    return buf;
  }
  return Buffer.alloc(0);
}

export async function transcribeLocalAudio(
  audioBytes: Uint8Array | Buffer | number[] | Record<string, number>,
  modelId = 'parakeet-tdt-0.6b-v3-int8'
): Promise<SpeechToTextResult> {
  const ready = await isModelReady(modelId);
  if (!ready) {
    throw new Error('STT_LOCAL_MODEL_NOT_DOWNLOADED');
  }

  const sherpa = loadSherpaAddon();
  const recognizer = getOrInitRecognizer(modelId, sherpa);
  const manifest = getLocalSpeechModelManifest(modelId);
  const targetSampleRate = manifest?.sampleRate ?? 16000;

  const nodeBuffer = toBuffer(audioBytes);

  let samples: Float32Array;
  let sampleRate: number;

  try {
    if (typeof sherpa.readWaveFromBinary === 'function') {
      const wave = sherpa.readWaveFromBinary(nodeBuffer);
      samples = wave.samples;
      sampleRate = wave.sampleRate;
    } else if (typeof sherpa.readWaveFromBinaryData === 'function') {
      const wave = sherpa.readWaveFromBinaryData(nodeBuffer);
      samples = wave.samples;
      sampleRate = wave.sampleRate;
    } else {
      throw new Error('No wave parser available');
    }
  } catch {
    // If not a valid WAV header or parsing failed, treat as raw 16-bit PCM (little endian)
    const int16 = new Int16Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength / 2);
    samples = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      samples[i] = int16[i] / 32768.0;
    }
    sampleRate = targetSampleRate;
  }

  let text = '';
  if (typeof recognizer.createStream === 'function') {
    // OOP JS / WASM interface
    const stream = recognizer.createStream();
    try {
      stream.acceptWaveform(sampleRate, samples);
      recognizer.decode(stream);
      const result = recognizer.getResult(stream);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      text = (parsed?.text ?? '').trim();
    } finally {
      try {
        stream.free?.();
      } catch {
        // ignore
      }
    }
  } else {
    // Native C++ NAPI addon interface
    const stream = sherpa.createOfflineStream(recognizer);
    try {
      sherpa.acceptWaveformOffline(stream, { sampleRate, samples });
      sherpa.decodeOfflineStream(recognizer, stream);
      const resultJson = sherpa.getOfflineStreamResultAsJson(stream);
      const parsed = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
      text = (parsed?.text ?? '').trim();
    } finally {
      // Native addon manages memory or GC
    }
  }

  return {
    language: manifest?.language,
    model: modelId,
    provider: 'local',
    text,
  };
}

export function clearLocalRecognizerCache(): void {
  activeRecognizerCache = null;
}
