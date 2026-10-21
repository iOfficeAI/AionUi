/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SpeechModelFileSpec = {
  name: string;
  sha256: string;
  sizeBytes: number;
  url: string;
};

export type LocalSpeechModelManifest = {
  description: string;
  files: SpeechModelFileSpec[];
  id: string;
  label: string;
  language: string;
  modelingUnit: 'bpe' | 'cjkchar' | 'cjkchar+bpe';
  recommended?: boolean;
  sampleRate: number;
  totalSizeBytes: number;
  type: 'transducer';
};

export type ModelDownloadProgressCallback = (progress: {
  downloadedBytes: number;
  modelId: string;
  percent: number;
  totalBytes: number;
}) => void;
