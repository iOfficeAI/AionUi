/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LocalSpeechModelManifest, SpeechModelFileSpec } from './types';

const hfFiles = (
  repo: string,
  revision: string,
  specs: Array<[name: string, sizeBytes: number, sha256: string]>
): SpeechModelFileSpec[] =>
  specs.map(([name, sizeBytes, sha256]) => ({
    name,
    sizeBytes,
    sha256,
    url: `https://huggingface.co/${repo}/resolve/${revision}/${encodeURIComponent(name)}?download=true`,
  }));

export const LOCAL_SPEECH_MODELS: LocalSpeechModelManifest[] = [
  {
    id: 'parakeet-tdt-0.6b-v3-int8',
    label: 'Parakeet TDT v3',
    description: 'High accuracy for 25 languages (EN, PT, ES, FR, DE, etc.). Automatic punctuation and capitalization.',
    type: 'transducer',
    language: 'multilingual',
    sampleRate: 16000,
    modelingUnit: 'bpe',
    recommended: true,
    totalSizeBytes: 652184281 + 11845275 + 6355277 + 93939,
    files: hfFiles(
      'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
      '2bda32ec70b097a55adaa07d9a7173915b43cc78',
      [
        ['encoder.int8.onnx', 652184281, 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247'],
        ['decoder.int8.onnx', 11845275, '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e'],
        ['joiner.int8.onnx', 6355277, '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3'],
        ['tokens.txt', 93939, 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d'],
      ]
    ),
  },
  {
    id: 'parakeet-tdt-0.6b-v2-int8',
    label: 'Parakeet TDT v2',
    description: 'English-only FastConformer TDT 0.6B INT8. Faster and lighter English transcription.',
    type: 'transducer',
    language: 'en',
    sampleRate: 16000,
    modelingUnit: 'bpe',
    totalSizeBytes: 652184296 + 7257753 + 1739080 + 93939,
    files: hfFiles(
      'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
      '1ab9323565ddb038682214b292f588070a538ce2',
      [
        ['encoder.int8.onnx', 652184296, 'a32b12d17bbbc309d0686fbbcc2987b5e9b8333a7da83fa6b089f0a2acd651ab'],
        ['decoder.int8.onnx', 7257753, 'b6bb64963457237b900e496ee9994b59294526439fbcc1fecf705b31a15c6b4e'],
        ['joiner.int8.onnx', 1739080, '7946164367946e7f9f29a122407c3252b680dbae9a51343eb2488d057c3c43d2'],
        ['tokens.txt', 93939, 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d'],
      ]
    ),
  },
];

export const getLocalSpeechModelManifest = (modelId: string): LocalSpeechModelManifest | undefined =>
  LOCAL_SPEECH_MODELS.find((m) => m.id === modelId) ?? LOCAL_SPEECH_MODELS[0];
