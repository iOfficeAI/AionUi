/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SpeechToTextProvider = 'openai' | 'deepgram';

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
  enabled: boolean;
  provider: SpeechToTextProvider;
  deepgram?: DeepgramSpeechToTextConfig;
  openai?: OpenAISpeechToTextConfig;
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

export type TextToSpeechProvider = 'system' | 'openai';

export type SystemTextToSpeechConfig = {
  /** Voice name (looked up via `window.speechSynthesis.getVoices()`) */
  voice?: string;
  /** Playback rate (Web Speech API `SpeechSynthesisUtterance.rate`) */
  rate?: number;
};

export type OpenAITextToSpeechConfig = {
  apiKey?: string;
  baseUrl?: string;
  /** Model name. Default: 'tts-1' */
  model?: string;
  /** Voice name. Default: 'alloy' */
  voice?: string;
};

export type TextToSpeechConfig = {
  enabled: boolean;
  provider: TextToSpeechProvider;
  /** Global default for per-conversation voice mode */
  voiceModeDefault?: boolean;
  /** Auto-play incoming spoken blocks (default: true) */
  autoPlay?: boolean;
  /** Web Speech API config (provider = 'system') */
  system?: SystemTextToSpeechConfig;
  /** OpenAI TTS config (provider = 'openai') */
  openai?: OpenAITextToSpeechConfig;
};

/** Wire shape expected by AionCore's `POST /api/tts` (snake_case fields, mirrors `SpeechToTextConfig`). */
export type OpenAITextToSpeechWireConfig = {
  api_key?: string;
  base_url?: string;
  model?: string;
  voice?: string;
};

/** Wire shape for the `/api/tts` request config. The `system` provider never reaches the backend. */
export type TextToSpeechWireConfig = {
  enabled: boolean;
  provider: TextToSpeechProvider;
  openai?: OpenAITextToSpeechWireConfig;
};

export type TextToSpeechRequest = {
  text: string;
  config: TextToSpeechWireConfig;
};

export type TextToSpeechResult = {
  /** Base64-encoded audio payload */
  audio: string;
  /** MIME type (e.g. 'audio/mpeg') */
  mime: string;
};
