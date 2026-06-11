/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TextToSpeechConfig, TextToSpeechResult, TextToSpeechWireConfig } from '@/common/types/provider/speech';

/**
 * Map the renderer-side camelCase config to the snake_case wire shape
 * expected by AionCore's `POST /api/tts` (mirrors `SpeechToTextConfig`).
 */
export const toTextToSpeechWireConfig = (config: TextToSpeechConfig): TextToSpeechWireConfig => ({
  enabled: config.enabled,
  provider: config.provider,
  openai: config.openai
    ? {
        api_key: config.openai.apiKey,
        base_url: config.openai.baseUrl,
        model: config.openai.model,
        voice: config.openai.voice,
      }
    : undefined,
});

/** Lifecycle state of a single playable item. */
export type TtsPlayableState = 'idle' | 'playing' | 'paused' | 'stopped' | 'errored';

/** Callback registered via `onEnd` / `onError`. */
export type TtsPlayableListener = () => void;

/**
 * Uniform handle returned by {@link TtsService.synthesize}. Both providers
 * (`system` / `openai`) expose the same shape so consumers (e.g. the playback
 * queue) can drive either without special-casing.
 */
export type TtsPlayable = {
  /** Start or resume playback. */
  play(): void;
  /** Pause playback; {@link play} resumes from the current position. */
  pause(): void;
  /** Stop playback and reset to the beginning. The item cannot be replayed. */
  stop(): void;
  /** Whether the underlying engine is currently producing audio. */
  readonly state: TtsPlayableState;
  /** Fired when the item finishes naturally (only after `play()`). */
  onEnd(cb: TtsPlayableListener): () => void;
  /** Fired when the engine reports an error or fails to start. */
  onError(cb: TtsPlayableListener): () => void;
};

// ---------------------------------------------------------------------------
// System (Web Speech API) provider
// ---------------------------------------------------------------------------

type SpeechSynthesisLike = {
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): Array<{ name: string; lang?: string }>;
  paused: boolean;
  speaking: boolean;
};

type SpeechSynthesisUtteranceLike = {
  text: string;
  rate: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  voice: { name: string } | null;
};

type SpeechSynthesisUtteranceCtor = new (text: string) => SpeechSynthesisUtteranceLike;

/** Minimal `window` shape we read from for the system provider. */
type SpeechHost = {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: SpeechSynthesisUtteranceCtor;
};

const resolveSpeechHost = (host?: SpeechHost | null): SpeechHost | null => {
  if (host) return host;
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    window?: SpeechHost;
    speechSynthesis?: SpeechSynthesisLike;
    SpeechSynthesisUtterance?: SpeechSynthesisUtteranceCtor;
  };
  // Prefer `window` (browser / jsdom) but fall back to globals on `globalThis`
  // so node-side tests that install speech engines on `globalThis` still work.
  if (g.window) {
    return {
      speechSynthesis: g.window.speechSynthesis ?? g.speechSynthesis,
      SpeechSynthesisUtterance: g.window.SpeechSynthesisUtterance ?? g.SpeechSynthesisUtterance,
    };
  }
  if (g.speechSynthesis || g.SpeechSynthesisUtterance) {
    return { speechSynthesis: g.speechSynthesis, SpeechSynthesisUtterance: g.SpeechSynthesisUtterance };
  }
  return null;
};

const getSystemSpeech = (
  host?: SpeechHost | null
): {
  synthesis: SpeechSynthesisLike;
  Utterance: SpeechSynthesisUtteranceCtor;
} | null => {
  const resolved = resolveSpeechHost(host);
  if (!resolved) return null;
  const synthesis = resolved.speechSynthesis;
  const Utterance = resolved.SpeechSynthesisUtterance;
  if (!synthesis || !Utterance) return null;
  return { synthesis, Utterance };
};

const createSystemPlayable = (text: string, config: TextToSpeechConfig, host?: SpeechHost | null): TtsPlayable => {
  const system = getSystemSpeech(host);
  if (!system) {
    // No Web Speech API available in this environment (e.g. jsdom, SSR).
    const errorListeners = new Set<TtsPlayableListener>();
    const stateRef: { value: TtsPlayableState } = { value: 'errored' };
    // Schedule an error on next microtask so consumers observe it consistently.
    queueMicrotask(() => {
      for (const cb of errorListeners) cb();
    });
    return {
      play: () => {
        // no-op
      },
      pause: () => {
        // no-op
      },
      stop: () => {
        // no-op
      },
      get state() {
        return stateRef.value;
      },
      onEnd: (_cb) => {
        // Never resolves — surface as a no-op so listeners aren't called.
        return () => {};
      },
      onError: (cb) => {
        errorListeners.add(cb);
        return () => errorListeners.delete(cb);
      },
    };
  }

  const { synthesis, Utterance } = system;
  const endListeners = new Set<TtsPlayableListener>();
  const errorListeners = new Set<TtsPlayableListener>();
  const stateRef: { value: TtsPlayableState } = { value: 'idle' };
  let started = false;

  const resolveVoice = (name: string | undefined) => {
    if (!name) return null;
    try {
      const voices = synthesis.getVoices();
      return voices.find((v) => v.name === name) ?? null;
    } catch {
      return null;
    }
  };

  const fireEnd = () => {
    for (const cb of endListeners) cb();
  };
  const fireError = () => {
    for (const cb of errorListeners) cb();
  };

  return {
    play() {
      if (started) {
        if (stateRef.value === 'paused') {
          try {
            synthesis.resume();
            stateRef.value = 'playing';
          } catch (err) {
            console.warn('[TtsService] system resume failed:', err);
            stateRef.value = 'errored';
            fireError();
          }
        }
        return;
      }
      started = true;
      try {
        synthesis.cancel();
        const u = new Utterance(text);
        u.rate = config.system?.rate ?? 1;
        const voice = resolveVoice(config.system?.voice);
        if (voice) {
          u.voice = { name: voice.name };
        }
        // Web Speech API exposes lifecycle via `onend` / `onerror` setters;
        // there is no `addEventListener` on SpeechSynthesisUtterance.
        // eslint-disable-next-line unicorn/prefer-add-event-listener
        u.onend = () => {
          stateRef.value = 'stopped';
          fireEnd();
        };
        // eslint-disable-next-line unicorn/prefer-add-event-listener
        u.onerror = () => {
          stateRef.value = 'errored';
          fireError();
        };
        synthesis.speak(u);
        stateRef.value = 'playing';
      } catch (err) {
        console.warn('[TtsService] system speak failed:', err);
        stateRef.value = 'errored';
        fireError();
      }
    },
    pause() {
      if (stateRef.value !== 'playing') return;
      try {
        synthesis.pause();
        stateRef.value = 'paused';
      } catch (err) {
        console.warn('[TtsService] system pause failed:', err);
      }
    },
    stop() {
      try {
        synthesis.cancel();
      } catch {
        // ignore
      }
      if (stateRef.value !== 'errored') {
        stateRef.value = 'stopped';
      }
    },
    get state() {
      return stateRef.value;
    },
    onEnd(cb) {
      endListeners.add(cb);
      return () => endListeners.delete(cb);
    },
    onError(cb) {
      errorListeners.add(cb);
      return () => errorListeners.delete(cb);
    },
  };
};

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

/** Minimal AudioElement contract we rely on. Override via `createOpenAIPlayable` for tests. */
export type TtsAudioElement = {
  src: string;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'ended' | 'error', listener: () => void): void;
  removeEventListener(type: 'ended' | 'error', listener: () => void): void;
};

const decodeBase64ToBlob = (base64: string, mime: string): Blob => {
  // atob is available in both browser and jsdom (which AionUi uses for tests).
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
};

const createObjectURL = (blob: Blob): string => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return `blob:mock/${Date.now()}`;
  }
  return URL.createObjectURL(blob);
};

const createOpenAIPlayable = (
  text: string,
  config: TextToSpeechConfig,
  audioFactory: () => TtsAudioElement,
  objectURLFactory: (blob: Blob) => string = createObjectURL,
  fetchImpl: (text: string, config: TextToSpeechConfig) => Promise<TextToSpeechResult> = (payload, cfg) =>
    ipcBridge.tts.synthesize.invoke({ text: payload, config: toTextToSpeechWireConfig(cfg) })
): TtsPlayable => {
  const endListeners = new Set<TtsPlayableListener>();
  const errorListeners = new Set<TtsPlayableListener>();
  const stateRef: { value: TtsPlayableState } = { value: 'idle' };
  let audio: TtsAudioElement | null = null;
  let objectUrl: string | null = null;
  let onEndRef: (() => void) | null = null;
  let onErrorRef: (() => void) | null = null;
  let started = false;

  const fireEnd = () => {
    for (const cb of endListeners) cb();
  };
  const fireError = () => {
    for (const cb of errorListeners) cb();
  };

  const cleanup = () => {
    if (audio) {
      if (onEndRef) audio.removeEventListener('ended', onEndRef);
      if (onErrorRef) audio.removeEventListener('error', onErrorRef);
    }
    if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    }
    objectUrl = null;
  };

  return {
    play() {
      if (started) {
        if (stateRef.value === 'paused' && audio) {
          void audio.play().catch((err: unknown) => {
            console.warn('[TtsService] openai resume failed:', err);
            stateRef.value = 'errored';
            fireError();
          });
          stateRef.value = 'playing';
        }
        return;
      }
      started = true;
      fetchImpl(text, config)
        .then((result) => {
          if (!result?.audio) {
            stateRef.value = 'errored';
            fireError();
            return;
          }
          const blob = decodeBase64ToBlob(result.audio, result.mime || 'audio/mpeg');
          objectUrl = objectURLFactory(blob);
          const element = audioFactory();
          element.src = objectUrl;
          audio = element;
          onEndRef = () => {
            stateRef.value = 'stopped';
            cleanup();
            fireEnd();
          };
          onErrorRef = () => {
            stateRef.value = 'errored';
            cleanup();
            fireError();
          };
          element.addEventListener('ended', onEndRef);
          element.addEventListener('error', onErrorRef);
          void element.play().then(
            () => {
              stateRef.value = 'playing';
            },
            (err: unknown) => {
              console.warn('[TtsService] openai play failed:', err);
              stateRef.value = 'errored';
              fireError();
            }
          );
        })
        .catch((err: unknown) => {
          console.warn('[TtsService] openai synthesize failed:', err);
          stateRef.value = 'errored';
          fireError();
        });
    },
    pause() {
      if (stateRef.value !== 'playing' || !audio) return;
      try {
        audio.pause();
        stateRef.value = 'paused';
      } catch (err) {
        console.warn('[TtsService] openai pause failed:', err);
      }
    },
    stop() {
      try {
        audio?.pause();
      } catch {
        // ignore
      }
      if (stateRef.value !== 'errored') {
        stateRef.value = 'stopped';
      }
      cleanup();
    },
    get state() {
      return stateRef.value;
    },
    onEnd(cb) {
      endListeners.add(cb);
      return () => endListeners.delete(cb);
    },
    onError(cb) {
      errorListeners.add(cb);
      return () => errorListeners.delete(cb);
    },
  };
};

// ---------------------------------------------------------------------------
// Public facade
// ---------------------------------------------------------------------------

export type TtsServiceOptions = {
  /** Override the Audio element factory (default: `new Audio()`). Useful in tests. */
  audioFactory?: () => TtsAudioElement;
  /** Override the object-URL factory (default: `URL.createObjectURL`). */
  objectURLFactory?: (blob: Blob) => string;
  /** Override the fetch implementation. Defaults to `ipcBridge.tts.synthesize.invoke`. */
  fetch?: (text: string, config: TextToSpeechConfig) => Promise<TextToSpeechResult>;
  /**
   * Inject the Web Speech API host. When omitted the service reads
   * `window.speechSynthesis` / `window.SpeechSynthesisUtterance` (with a
   * `globalThis` fallback for test environments).
   */
  speechHost?: SpeechHost | null;
};

const defaultAudioFactory = (): TtsAudioElement => {
  // Guard for non-browser test environments.
  if (typeof Audio === 'undefined') {
    throw new Error('TtsService: HTMLAudioElement is not available in this environment');
  }
  return new Audio() as unknown as TtsAudioElement;
};

export class TtsService {
  private readonly options: TtsServiceOptions;

  constructor(options: TtsServiceOptions = {}) {
    this.options = options;
  }

  /**
   * Synthesize `text` using the provider specified in `config` and return a
   * uniform playable handle. The caller is responsible for invoking `play()`
   * and forwarding the `onEnd` / `onError` callbacks (typically via the
   * queue).
   */
  synthesize(text: string, config: TextToSpeechConfig): TtsPlayable {
    if (!config || config.provider === 'system') {
      return createSystemPlayable(text, config, this.options.speechHost);
    }
    if (config.provider === 'openai') {
      return createOpenAIPlayable(
        text,
        config,
        this.options.audioFactory ?? defaultAudioFactory,
        this.options.objectURLFactory,
        this.options.fetch
      );
    }
    // Unknown provider — degrade gracefully via the system path.
    return createSystemPlayable(text, config, this.options.speechHost);
  }
}

export const ttsService = new TtsService();
