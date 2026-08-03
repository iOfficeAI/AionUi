/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thin wrapper around Chromium's speechSynthesis for the voice-read feature.
 *
 * - Enumerates voices after `voiceschanged` with a few self-check retries
 *   (some platforms populate the voice list late or never fire the event).
 * - Prefers a zh-CN local voice (`localService`) so playback works offline.
 * - Degrades silently when no voice is available: callers are notified via
 *   the availability subscription and playback requests fail softly.
 */

type AvailabilityListener = (available: boolean) => void;

type SpeakCallbacks = {
  onend?: () => void;
  onerror?: (error: unknown) => void;
};

class VoiceReadEngine {
  private voices: SpeechSynthesisVoice[] = [];
  private voice: SpeechSynthesisVoice | null = null;
  private initialized = false;
  private availabilityListeners = new Set<AvailabilityListener>();

  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  get available(): boolean {
    return this.supported && this.voices.length > 0;
  }

  init(): void {
    if (this.initialized || !this.supported) return;
    this.initialized = true;
    const synth = window.speechSynthesis;

    const load = () => {
      this.voices = synth.getVoices();
      this.voice = this.pickVoice(this.voices);
      this.notifyAvailability();
    };

    load();
    synth.addEventListener('voiceschanged', load);
    // Self-check retries in case voiceschanged never fires.
    [300, 900, 2000].forEach((delay) => {
      window.setTimeout(() => {
        if (!this.voices.length) load();
      }, delay);
    });
    window.addEventListener('beforeunload', () => {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    });

    if (this.voices.length) {
      console.info('[voiceRead] voice selected:', this.voice?.name, this.voice?.lang);
    } else {
      console.warn('[voiceRead] no speechSynthesis voices yet, waiting for voiceschanged');
    }
  }

  private pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const zh = voices.filter((v) => /^zh([-_]|$)/i.test(v.lang));
    const zhCN = zh.filter((v) => /^zh[-_]CN$/i.test(v.lang));
    return zhCN.find((v) => v.localService) ?? zhCN[0] ?? zh.find((v) => v.localService) ?? zh[0] ?? null;
  }

  subscribeAvailability(listener: AvailabilityListener): () => void {
    this.availabilityListeners.add(listener);
    return () => {
      this.availabilityListeners.delete(listener);
    };
  }

  private notifyAvailability(): void {
    const available = this.available;
    this.availabilityListeners.forEach((listener) => listener(available));
  }

  speak(text: string, rate: number, callbacks: SpeakCallbacks): void {
    if (!this.supported) {
      callbacks.onerror?.(new Error('speechSynthesis not supported'));
      return;
    }
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    } else {
      utterance.lang = 'zh-CN';
    }
    utterance.rate = rate;
    utterance.addEventListener('end', () => callbacks.onend?.());
    utterance.addEventListener('error', (event) => {
      const code = (event as SpeechSynthesisErrorEvent).error;
      // cancel()/interrupt surface as errors; treat them like a normal end so
      // the caller's staleness guard can decide what to do.
      if (code === 'canceled' || code === 'interrupted') {
        callbacks.onend?.();
      } else {
        callbacks.onerror?.(event);
      }
    });
    try {
      // Escape a lingering paused state before starting a new utterance.
      synth.resume();
    } catch {
      /* ignore */
    }
    synth.speak(utterance);
  }

  pause(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.pause();
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }

  cancel(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export const voiceReadEngine = new VoiceReadEngine();
