/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEEPGRAM_SPEECH_MODEL_PRESETS,
  DEFAULT_SPEECH_TO_TEXT_CONFIG,
  OPENAI_SPEECH_MODEL_PRESETS,
  applySpeechSource,
  buildModelOptions,
  deriveSpeechSource,
  isValidHttpUrl,
  normalizeSpeechToTextConfig,
} from '@renderer/components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection/speechSettingsUtils';

describe('deriveSpeechSource', () => {
  it('returns deepgram when provider is deepgram', () => {
    const config = normalizeSpeechToTextConfig({ enabled: true, provider: 'deepgram' });
    expect(deriveSpeechSource(config)).toBe('deepgram');
  });

  it('returns openai for openai provider without base_url', () => {
    const config = normalizeSpeechToTextConfig({ enabled: true, provider: 'openai' });
    expect(deriveSpeechSource(config)).toBe('openai');
  });

  it('returns custom for openai provider with non-empty base_url', () => {
    const config = normalizeSpeechToTextConfig({
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', base_url: 'https://my-host/v1', model: 'whisper-1' },
    });
    expect(deriveSpeechSource(config)).toBe('custom');
  });

  it('treats whitespace-only base_url as official openai', () => {
    const config = normalizeSpeechToTextConfig({
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', base_url: '  ', model: 'whisper-1' },
    });
    expect(deriveSpeechSource(config)).toBe('openai');
  });
});

describe('applySpeechSource', () => {
  const customConfig = normalizeSpeechToTextConfig({
    enabled: true,
    provider: 'openai',
    openai: { api_key: 'k', base_url: 'https://my-host/v1', model: 'my-model' },
  });

  it('switching to official openai clears base_url', () => {
    const next = applySpeechSource(customConfig, 'openai');
    expect(next.provider).toBe('openai');
    expect(next.openai?.base_url).toBe('');
  });

  it('switching to deepgram only changes provider and keeps openai sub-config', () => {
    const next = applySpeechSource(customConfig, 'deepgram');
    expect(next.provider).toBe('deepgram');
    expect(next.openai?.base_url).toBe('https://my-host/v1');
  });

  it('switching to custom restores remembered base_url when current one is empty', () => {
    const official = applySpeechSource(customConfig, 'openai');
    const next = applySpeechSource(official, 'custom', 'https://my-host/v1');
    expect(deriveSpeechSource(next)).toBe('custom');
    expect(next.openai?.base_url).toBe('https://my-host/v1');
  });

  it('switching to custom keeps existing base_url when already set', () => {
    const next = applySpeechSource(customConfig, 'custom', 'https://other/v1');
    expect(next.openai?.base_url).toBe('https://my-host/v1');
  });
});

describe('model presets', () => {
  it('openai presets exclude realtime-only models in phase 1', () => {
    expect(OPENAI_SPEECH_MODEL_PRESETS).toContain('gpt-4o-transcribe');
    expect(OPENAI_SPEECH_MODEL_PRESETS).toContain('whisper-1');
    expect(OPENAI_SPEECH_MODEL_PRESETS).not.toContain('gpt-realtime-whisper');
  });

  it('deepgram presets contain nova models', () => {
    expect(DEEPGRAM_SPEECH_MODEL_PRESETS).toEqual(['nova-3', 'nova-2']);
  });

  it('defaults use the recommended models', () => {
    expect(DEFAULT_SPEECH_TO_TEXT_CONFIG.openai?.model).toBe('gpt-4o-transcribe');
    expect(DEFAULT_SPEECH_TO_TEXT_CONFIG.deepgram?.model).toBe('nova-3');
  });
});

describe('buildModelOptions', () => {
  it('returns presets as-is when current model is in presets', () => {
    expect(buildModelOptions(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('appends stored non-preset model so existing configs keep working', () => {
    expect(buildModelOptions(['a', 'b'], 'legacy-model')).toEqual(['a', 'b', 'legacy-model']);
  });

  it('ignores empty current model', () => {
    expect(buildModelOptions(['a'], '')).toEqual(['a']);
  });

  it('returns a copy so callers cannot mutate the preset constants', () => {
    const presets = ['a', 'b'];
    const options = buildModelOptions(presets, 'a');
    expect(options).not.toBe(presets);
  });
});

describe('isValidHttpUrl', () => {
  it('accepts http and https urls', () => {
    expect(isValidHttpUrl('https://my-host/v1')).toBe(true);
    expect(isValidHttpUrl('http://127.0.0.1:8000/v1')).toBe(true);
  });

  it('rejects other schemes and garbage', () => {
    expect(isValidHttpUrl('wss://my-host')).toBe(false);
    expect(isValidHttpUrl('my-host/v1')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
  });
});

describe('normalizeSpeechToTextConfig', () => {
  it('fills defaults for missing sub-configs', () => {
    const config = normalizeSpeechToTextConfig(undefined);
    expect(config.enabled).toBe(false);
    expect(config.openai?.model).toBe('gpt-4o-transcribe');
    expect(config.deepgram?.punctuate).toBe(true);
  });

  it('preserves stored values over defaults', () => {
    const config = normalizeSpeechToTextConfig({
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', model: 'whisper-1' },
    });
    expect(config.openai?.model).toBe('whisper-1');
    expect(config.enabled).toBe(true);
  });

  it('fills defaults for an explicitly empty openai sub-config', () => {
    const config = normalizeSpeechToTextConfig({ enabled: false, provider: 'openai', openai: {} as never });
    expect(config.openai?.model).toBe('gpt-4o-transcribe');
  });
});
