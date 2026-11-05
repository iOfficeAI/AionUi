/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SpeechToTextProvider = 'openai' | 'deepgram' | 'local';

export type LocalSpeechModelId = 'parakeet-tdt-0.6b-v3-int8' | 'parakeet-tdt-0.6b-v2-int8';

export type LocalSpeechToTextConfig = {
  hotwords?: string;
  language?: string;
  model: LocalSpeechModelId | string;
};

export type SpeechModelDownloadStatus = {
  downloadedBytes: number;
  error?: string;
  modelId: string;
  progress: number;
  status: 'idle' | 'downloading' | 'ready' | 'error';
  totalBytes: number;
};

export type OpenAISpeechToTextConfig = {
  api_key: string;
  base_url?: string;
  language?: string;
  model: string;
  prompt?: string;
  temperature?: number;
};

export type DeepgramSpeechToTextConfig = {
  api_key: string;
  base_url?: string;
  detectLanguage?: boolean;
  language?: string;
  model: string;
  punctuate?: boolean;
  smartFormat?: boolean;
};

export type SpeechToTextConfig = {
  autoSend?: boolean;
  deepgram?: DeepgramSpeechToTextConfig;
  enabled: boolean;
  local?: LocalSpeechToTextConfig;
  openai?: OpenAISpeechToTextConfig;
  provider: SpeechToTextProvider;
};

export type SpeechToTextAudioBuffer = Uint8Array | number[] | Record<string, number>;

export type SpeechToTextRequest = {
  audioBuffer: SpeechToTextAudioBuffer;
  file_name: string;
  languageHint?: string;
  mimeType: string;
};

export type SpeechToTextResult = {
  language?: string;
  model: string;
  provider: SpeechToTextProvider;
  text: string;
};
