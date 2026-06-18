/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpeechToTextConfig } from '@/common/types/provider/speech';
export { DEEPGRAM_SPEECH_MODEL_PRESETS, OPENAI_SPEECH_MODEL_PRESETS } from '@renderer/services/speech/speechModels';

/** UI-level service source. 'custom' is stored as provider:'openai' + non-empty base_url. */
export type SpeechSource = 'openai' | 'deepgram' | 'custom';

/** Language autonyms are intentionally not translated. Empty value = auto detect. */
export const SPEECH_LANGUAGE_OPTIONS: Array<{ value: string; label?: string }> = [
  { value: '' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
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

/**
 * Whisper-family models do not distinguish Simplified/Traditional Chinese for
 * `language=zh`; a same-script prompt steers the output script.
 */
export const AUTO_TRANSCRIPTION_PROMPTS: Record<string, string> = {
  'zh-CN': '以下是普通话的句子。',
  'zh-TW': '以下是普通話的句子。',
};

export const getAutoTranscriptionPrompt = (language: string): string | undefined =>
  AUTO_TRANSCRIPTION_PROMPTS[language];

/**
 * Phase 1 stored the ambiguous 'zh' language: migrate it to 'zh-CN' for both
 * provider sub-configs (and inject the matching OpenAI script prompt).
 */
export const migrateSpeechLanguage = (config: SpeechToTextConfig): SpeechToTextConfig => {
  let next = config;
  if (next.openai?.language === 'zh') {
    next = {
      ...next,
      openai: { ...next.openai, language: 'zh-CN', prompt: getAutoTranscriptionPrompt('zh-CN') },
    };
  }
  if (next.deepgram?.language === 'zh') {
    next = { ...next, deepgram: { ...next.deepgram, language: 'zh-CN' } };
  }
  return next;
};

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
