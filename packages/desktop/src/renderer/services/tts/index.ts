/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { TextToSpeechConfig } from '@/common/types/provider/speech';
import { TtsQueue } from './TtsQueue';

/** Event name dispatched on `window` whenever the TTS config changes. */
export const TEXT_TO_SPEECH_CONFIG_CHANGED_EVENT = 'aionui:text-to-speech-config-changed';

export const DEFAULT_TEXT_TO_SPEECH_CONFIG: TextToSpeechConfig = {
  enabled: false,
  provider: 'system',
  voiceModeDefault: false,
  autoPlay: true,
  system: {
    voice: '',
    rate: 1,
  },
  openai: {
    apiKey: '',
    baseUrl: '',
    model: 'tts-1',
    voice: 'alloy',
  },
};

export const normalizeTextToSpeechConfig = (config?: TextToSpeechConfig | null): TextToSpeechConfig => ({
  ...DEFAULT_TEXT_TO_SPEECH_CONFIG,
  ...config,
  system: {
    ...DEFAULT_TEXT_TO_SPEECH_CONFIG.system,
    ...config?.system,
  },
  openai: {
    ...DEFAULT_TEXT_TO_SPEECH_CONFIG.openai,
    ...config?.openai,
  },
});

let singleton: TtsQueue | null = null;
let configUnsub: (() => void) | null = null;

const readCurrentConfig = (): TextToSpeechConfig | null => {
  const stored = configService.get('tools.textToSpeech');
  if (!stored) return null;
  return normalizeTextToSpeechConfig(stored);
};

/**
 * Returns the process-wide TTS queue. The queue is created lazily and is
 * seeded with the current TTS config from {@link configService}. It also
 * subscribes to config changes (and the legacy custom event) so consumers
 * never need to push config themselves.
 */
export const getTtsQueue = (): TtsQueue => {
  if (singleton) return singleton;
  const queue = new TtsQueue();
  singleton = queue;
  // Seed the initial config (may be undefined if not yet loaded).
  const initial = readCurrentConfig();
  if (initial) queue.setConfig(initial);
  if (typeof window !== 'undefined') {
    window.addEventListener(TEXT_TO_SPEECH_CONFIG_CHANGED_EVENT, () => {
      const next = readCurrentConfig();
      if (next) queue.setConfig(next);
    });
  }
  // Also react to configService subscription in case another path mutates
  // the value without dispatching the custom event.
  try {
    configUnsub = configService.subscribe('tools.textToSpeech', (value) => {
      if (!value) {
        return;
      }
      queue.setConfig(normalizeTextToSpeechConfig(value as TextToSpeechConfig));
    });
  } catch {
    // configService may not be initialized in non-renderer contexts.
  }
  return queue;
};

/** Test/diagnostic helper. Resets the singleton and detaches listeners. */
export const __resetTtsQueueForTests = (): void => {
  if (configUnsub) {
    configUnsub();
    configUnsub = null;
  }
  singleton = null;
};

export { TtsService, ttsService } from './TtsService';
export { TtsQueue } from './TtsQueue';
export type { TtsPlayable, TtsPlayableState, TtsPlayableListener, TtsServiceOptions } from './TtsService';
export type { TtsQueueItem, TtsQueueListener, TtsQueueState, TtsQueueStatus } from './TtsQueue';
