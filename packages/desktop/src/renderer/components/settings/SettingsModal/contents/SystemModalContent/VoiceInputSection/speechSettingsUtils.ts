/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpeechToTextConfig } from '@/common/types/provider/speech';

/** UI-level service source. 'custom' is stored as provider:'openai' + non-empty base_url. */
export type SpeechSource = 'openai' | 'deepgram' | 'custom';

/** Phase 1 only lists models valid for the file-based /audio/transcriptions endpoint. */
export const OPENAI_SPEECH_MODEL_PRESETS = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];
export const DEEPGRAM_SPEECH_MODEL_PRESETS = ['nova-3', 'nova-2'];

/** Language autonyms are intentionally not translated. Empty value = auto detect. */
export const SPEECH_LANGUAGE_OPTIONS: Array<{ value: string; label?: string }> = [
  { value: '' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'uk', label: 'Українська' },
];

export const DEFAULT_SPEECH_TO_TEXT_CONFIG: SpeechToTextConfig = {
  enabled: false,
  provider: 'openai',
  openai: {
    api_key: '',
    base_url: '',
    language: '',
    model: 'gpt-4o-transcribe',
  },
  deepgram: {
    api_key: '',
    base_url: '',
    detectLanguage: true,
    language: '',
    model: 'nova-3',
    punctuate: true,
    smartFormat: true,
  },
};

export const normalizeSpeechToTextConfig = (config?: Partial<SpeechToTextConfig>): SpeechToTextConfig => ({
  ...DEFAULT_SPEECH_TO_TEXT_CONFIG,
  ...config,
  openai: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai,
    ...config?.openai,
  },
  deepgram: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.deepgram,
    ...config?.deepgram,
  },
});

export const deriveSpeechSource = (config: SpeechToTextConfig): SpeechSource => {
  if (config.provider === 'deepgram') {
    return 'deepgram';
  }
  return config.openai?.base_url?.trim() ? 'custom' : 'openai';
};

/**
 * Apply a UI source choice onto the stored config shape.
 * `rememberedCustomBaseUrl` restores the last custom URL within the session
 * after the user toggles official -> custom.
 */
export const applySpeechSource = (
  config: SpeechToTextConfig,
  source: SpeechSource,
  rememberedCustomBaseUrl = ''
): SpeechToTextConfig => {
  if (source === 'deepgram') {
    return { ...config, provider: 'deepgram' };
  }
  if (source === 'custom') {
    const currentBaseUrl = config.openai?.base_url?.trim() ? config.openai.base_url : rememberedCustomBaseUrl;
    return {
      ...config,
      provider: 'openai',
      openai: { ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai, ...config.openai, base_url: currentBaseUrl },
    };
  }
  return {
    ...config,
    provider: 'openai',
    openai: { ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai, ...config.openai, base_url: '' },
  };
};

/** Strict Select would hide a stored non-preset model; surface it as an extra option. */
export const buildModelOptions = (presets: string[], currentModel?: string): string[] => {
  const model = currentModel?.trim();
  if (!model || presets.includes(model)) {
    return [...presets];
  }
  return [...presets, model];
};

export const isValidHttpUrl = (value: string): boolean => {
  if (!value.trim()) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
