/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the new `tools.textToSpeech` config slot, mirroring the
 * speech-to-text entry. Validates the type/key/registration wiring and the
 * TTS-specific normalization helpers exported from the renderer service.
 */

import { describe, expect, it } from 'vitest';

import type { TextToSpeechConfig, TextToSpeechProvider } from '@/common/types/provider/speech';
import { DEFAULT_TEXT_TO_SPEECH_CONFIG, normalizeTextToSpeechConfig } from '@/renderer/services/tts';

describe('TextToSpeechConfig type & storage wiring', () => {
  it('exposes the expected provider union', () => {
    // Compile-time check via assignment. The types are erased at runtime, so
    // we mainly rely on TS to keep this in sync.
    const providers: TextToSpeechProvider[] = ['system', 'openai'];
    expect(providers).toEqual(['system', 'openai']);
  });

  it('DEFAULT_TEXT_TO_SPEECH_CONFIG seeds the documented defaults', () => {
    expect(DEFAULT_TEXT_TO_SPEECH_CONFIG).toEqual({
      enabled: false,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    });
  });

  it('normalizeTextToSpeechConfig fills missing fields with defaults', () => {
    const partial: Partial<TextToSpeechConfig> = { enabled: true, provider: 'openai' };
    const result = normalizeTextToSpeechConfig(partial);
    expect(result.enabled).toBe(true);
    expect(result.provider).toBe('openai');
    expect(result.voiceModeDefault).toBe(false);
    expect(result.autoPlay).toBe(true);
    expect(result.system).toEqual({ voice: '', rate: 1 });
    expect(result.openai).toEqual({ apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' });
  });

  it('normalizeTextToSpeechConfig merges user overrides on top of defaults', () => {
    const result = normalizeTextToSpeechConfig({
      enabled: true,
      provider: 'openai',
      openai: { model: 'gpt-4o-mini-tts', voice: 'shimmer' },
      system: { voice: 'Karen', rate: 1.2 },
    });
    expect(result.openai?.model).toBe('gpt-4o-mini-tts');
    expect(result.openai?.voice).toBe('shimmer');
    expect(result.openai?.apiKey).toBe(''); // untouched
    expect(result.system).toEqual({ voice: 'Karen', rate: 1.2 });
  });

  it('normalizeTextToSpeechConfig tolerates null / undefined input', () => {
    expect(normalizeTextToSpeechConfig(null).provider).toBe('system');
    expect(normalizeTextToSpeechConfig(undefined).provider).toBe('system');
  });
});
