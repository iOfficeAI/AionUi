/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VoiceReadController — singleton state machine for the voice-read feature.
 *
 * Owns the sentence queue (derived from paragraphs of the active message),
 * drives VoiceReadEngine one sentence at a time, and exposes an immutable
 * snapshot for React UI. Streaming text is fed in via onStreamChunk /
 * onStreamFinish; the controller never touches message stores or reducers —
 * it is a pure observer of stream events handed to it by streamObserver.
 */

import { splitParagraphsForSpeech } from './textCleaner';
import { tokenizeSentences } from './sentenceSplitter';
import { voiceReadEngine } from './VoiceReadEngine';

export type VoiceReadStatus = 'idle' | 'speaking' | 'paused';
export type VoiceReadMode = 'auto' | 'message' | 'selection';

export interface VoiceReadSnapshot {
  status: VoiceReadStatus;
  mode: VoiceReadMode | null;
  autoEnabled: boolean;
  rate: number;
  activeMessageId: string | null;
  currentSentence: string;
  paragraphIndex: number;
  paragraphCount: number;
  voiceAvailable: boolean;
}

interface ActiveTrack {
  conversationId: string | null;
  messageId: string;
  rawText: string;
  paragraphs: string[][];
  flat: string[];
  paraOf: number[];
  /** Index into `flat` of the sentence currently being spoken (-1 = none yet). */
  speakIndex: number;
  /** True while more stream chunks for this message may still arrive. */
  streamOpen: boolean;
}

type SnapshotListener = (snapshot: VoiceReadSnapshot) => void;

const INITIAL_SNAPSHOT: VoiceReadSnapshot = {
  status: 'idle',
  mode: null,
  autoEnabled: false,
  rate: 1,
  activeMessageId: null,
  currentSentence: '',
  paragraphIndex: -1,
  paragraphCount: 0,
  voiceAvailable: false,
};

class VoiceReadController {
  private track: ActiveTrack | null = null;
  private status: VoiceReadStatus = 'idle';
  private mode: VoiceReadMode | null = null;
  private autoEnabled = false;
  private autoConversationId: string | null = null;
  private rate = 1;
  private voiceAvailable = false;
  /** Incremented on every manual navigation; stale utterance callbacks are ignored. */
  private token = 0;
  /** True when playback caught up with the stream and waits for more sentences. */
  private waitingForStream = false;
  private engineWired = false;
  private cachedSnapshot: VoiceReadSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<SnapshotListener>();

  init(): void {
    voiceReadEngine.init();
    if (this.engineWired) return;
    this.engineWired = true;
    voiceReadEngine.subscribeAvailability((available) => {
      this.voiceAvailable = available;
      this.emit();
    });
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.cachedSnapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): VoiceReadSnapshot {
    return this.cachedSnapshot;
  }

  private emit(): void {
    const track = this.track;
    this.cachedSnapshot = {
      status: this.status,
      mode: this.mode,
      autoEnabled: this.autoEnabled,
      rate: this.rate,
      activeMessageId: this.status === 'idle' ? null : (track?.messageId ?? null),
      currentSentence:
        track && track.speakIndex >= 0 && track.speakIndex < track.flat.length ? track.flat[track.speakIndex] : '',
      paragraphIndex: track && track.speakIndex >= 0 ? (track.paraOf[track.speakIndex] ?? -1) : -1,
      paragraphCount: track?.paragraphs.length ?? 0,
      voiceAvailable: this.voiceAvailable,
    };
    const snapshot = this.cachedSnapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  // ---------------------------------------------------------------------------
  // Track building
  // ---------------------------------------------------------------------------

  private buildTrack(
    conversationId: string | null,
    messageId: string,
    rawText: string,
    options: { final: boolean; streamOpen: boolean }
  ): ActiveTrack {
    const paragraphs = splitParagraphsForSpeech(rawText);
    const flat: string[] = [];
    const paraOf: number[] = [];
    const sentencesPerParagraph: string[][] = paragraphs.map((): string[] => []);

    paragraphs.forEach((paragraph, paragraphIdx) => {
      const isLastParagraph = paragraphIdx === paragraphs.length - 1;
      for (const token of tokenizeSentences(paragraph)) {
        // While streaming, only the last paragraph may hold an unclosed tail;
        // earlier paragraphs are structurally complete even without a final
        // punctuation mark (e.g. headings, list items).
        if (token.closed || options.final || !isLastParagraph) {
          flat.push(token.sentence);
          paraOf.push(paragraphIdx);
          sentencesPerParagraph[paragraphIdx].push(token.sentence);
        }
      }
    });

    return {
      conversationId,
      messageId,
      rawText,
      paragraphs: sentencesPerParagraph,
      flat,
      paraOf,
      speakIndex: -1,
      streamOpen: options.streamOpen,
    };
  }

  private rebuildTrack(rawText: string, options: { final: boolean; streamOpen: boolean }): void {
    const track = this.track;
    if (!track) return;
    const rebuilt = this.buildTrack(track.conversationId, track.messageId, rawText, options);
    track.paragraphs = rebuilt.paragraphs;
    track.flat = rebuilt.flat;
    track.paraOf = rebuilt.paraOf;
    track.rawText = rawText;
    track.streamOpen = options.streamOpen;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  private speakFrom(index: number): void {
    this.token += 1;
    const myToken = this.token;
    const track = this.track;

    if (!track || index >= track.flat.length) {
      if (track?.streamOpen) {
        // Caught up with the stream: stay in "speaking" state and wait for more text.
        this.waitingForStream = true;
        this.status = 'speaking';
      } else {
        this.waitingForStream = false;
        this.status = 'idle';
      }
      this.emit();
      return;
    }

    this.waitingForStream = false;
    this.status = 'speaking';
    track.speakIndex = index;
    const sentence = track.flat[index];

    voiceReadEngine.speak(sentence, this.rate, {
      onend: () => {
        if (myToken !== this.token) return;
        this.speakFrom(index + 1);
      },
      onerror: (error) => {
        if (myToken !== this.token) return;
        console.warn('[voiceRead] speak error, skipping sentence:', error);
        this.speakFrom(index + 1);
      },
    });
    this.emit();
  }

  private continueAfterStreamUpdate(): void {
    if (!this.waitingForStream) {
      this.emit();
      return;
    }
    this.waitingForStream = false;
    if (this.status === 'speaking') {
      const next = (this.track?.speakIndex ?? -1) + 1;
      this.speakFrom(next);
    } else {
      this.emit();
    }
  }

  private startTrack(
    conversationId: string | null,
    messageId: string,
    rawText: string,
    mode: VoiceReadMode,
    options: { final: boolean; streamOpen: boolean }
  ): void {
    this.token += 1;
    voiceReadEngine.cancel();
    this.track = this.buildTrack(conversationId, messageId, rawText, options);
    this.mode = mode;
    this.waitingForStream = false;
    this.speakFrom(0);
  }

  // ---------------------------------------------------------------------------
  // Public actions (UI)
  // ---------------------------------------------------------------------------

  /** Read a complete message (per-message button). */
  readMessage(conversationId: string | null, messageId: string, rawText: string): void {
    this.init();
    this.startTrack(conversationId, messageId, rawText, 'message', { final: true, streamOpen: false });
  }

  /** Read the user's current text selection. */
  readSelection(text: string): void {
    this.init();
    this.startTrack(null, 'selection', text, 'selection', { final: true, streamOpen: false });
  }

  /** Auto mode entry point: start reading the latest reply (may still stream). */
  readLatestAuto(conversationId: string | null, messageId: string, rawText: string): void {
    this.init();
    this.startTrack(conversationId, messageId, rawText, 'auto', { final: true, streamOpen: false });
  }

  /**
   * [voiceCall] Feed a generation-filtered streaming reply owned by call mode.
   * Call mode deliberately keeps ordinary auto-read disabled so late chunks
   * from an interrupted turn cannot start speech by themselves.
   */
  readCallStreamChunk(conversationId: string, messageId: string, fullRawText: string): void {
    this.init();
    const track = this.track;
    if (track && track.messageId === messageId && track.conversationId === conversationId) {
      this.rebuildTrack(fullRawText, { final: false, streamOpen: true });
      this.continueAfterStreamUpdate();
      return;
    }
    this.startTrack(conversationId, messageId, fullRawText, 'auto', { final: false, streamOpen: true });
  }

  stop(): void {
    this.token += 1;
    voiceReadEngine.cancel();
    this.track = null;
    this.mode = null;
    this.status = 'idle';
    this.waitingForStream = false;
    this.emit();
  }

  togglePause(): void {
    if (this.status === 'speaking') {
      voiceReadEngine.pause();
      this.status = 'paused';
      this.emit();
      return;
    }
    if (this.status === 'paused') {
      this.status = 'speaking';
      if (this.waitingForStream) {
        // Nothing was actually speaking; continue with newly arrived sentences.
        this.waitingForStream = false;
        const next = (this.track?.speakIndex ?? -1) + 1;
        this.speakFrom(next);
        return;
      }
      voiceReadEngine.resume();
      this.emit();
    }
  }

  /** Re-read the active message from the beginning. */
  repeat(): void {
    if (!this.track || !this.track.flat.length) return;
    this.status = 'speaking';
    this.waitingForStream = false;
    this.speakFrom(0);
  }

  setRate(rate: number): void {
    this.rate = rate;
    // Re-speak the current sentence at the new rate for immediate feedback.
    if (this.status === 'speaking' && this.track && !this.waitingForStream && this.track.speakIndex >= 0) {
      this.speakFrom(this.track.speakIndex);
      return;
    }
    this.emit();
  }

  /** Paragraph navigation (上一段 / 下一段). */
  skipParagraph(delta: -1 | 1): void {
    const track = this.track;
    if (!track || !track.flat.length) return;

    const currentIndex = Math.max(0, track.speakIndex);
    const currentParagraph = track.paraOf[currentIndex] ?? 0;
    const firstOfCurrent = track.paraOf.indexOf(currentParagraph);

    let targetParagraph: number;
    if (delta === 1) {
      if (currentParagraph >= track.paragraphs.length - 1) return;
      targetParagraph = currentParagraph + 1;
    } else {
      // First press jumps to the start of the current paragraph; pressing
      // again moves to the previous one.
      if (currentParagraph <= 0 && currentIndex <= firstOfCurrent) return;
      targetParagraph = currentIndex > firstOfCurrent ? currentParagraph : currentParagraph - 1;
    }

    const targetIndex = track.paraOf.indexOf(targetParagraph);
    if (targetIndex < 0) return;
    this.status = 'speaking';
    this.waitingForStream = false;
    this.speakFrom(targetIndex);
  }

  setAutoEnabled(enabled: boolean, conversationId?: string | null): void {
    this.autoEnabled = enabled;
    if (enabled) {
      this.autoConversationId = conversationId ?? this.autoConversationId;
    } else {
      this.autoConversationId = null;
      if (this.mode === 'auto') {
        this.stop();
        return;
      }
    }
    this.emit();
  }

  // ---------------------------------------------------------------------------
  // Stream hooks (fed by streamObserver — observation only)
  // ---------------------------------------------------------------------------

  onStreamChunk(conversationId: string, messageId: string, fullRawText: string): void {
    const track = this.track;

    // Append to the message currently being read (explicit or auto).
    if (track && track.messageId === messageId && track.conversationId === conversationId) {
      this.rebuildTrack(fullRawText, { final: false, streamOpen: true });
      this.continueAfterStreamUpdate();
      return;
    }

    // Auto mode: a newer reply started streaming — switch to it, unless the
    // user explicitly started reading something else (message/selection mode).
    const mayAutoStart = this.autoEnabled && conversationId === this.autoConversationId;
    const notExplicit = this.status === 'idle' || this.mode === 'auto' || this.mode === null;
    if (mayAutoStart && notExplicit) {
      this.startTrack(conversationId, messageId, fullRawText, 'auto', { final: false, streamOpen: true });
    }
  }

  onStreamFinish(conversationId: string, messageId: string, fullRawText: string): void {
    const track = this.track;
    if (!track || track.messageId !== messageId || track.conversationId !== conversationId) return;
    this.rebuildTrack(fullRawText, { final: true, streamOpen: false });
    this.continueAfterStreamUpdate();
  }

  onStreamError(conversationId: string, messageId: string): void {
    const track = this.track;
    if (!track || track.messageId !== messageId || track.conversationId !== conversationId) return;
    track.streamOpen = false;
    this.continueAfterStreamUpdate();
  }

  /** Called when the conversation view owning the stream observer unmounts/switches. */
  attachConversation(conversationId: string): void {
    if (this.autoEnabled) {
      this.autoConversationId = conversationId;
      this.emit();
    }
  }

  detachConversation(conversationId: string): void {
    if (this.autoConversationId === conversationId) {
      this.autoConversationId = null;
    }
    if (this.track?.conversationId === conversationId) {
      this.stop();
    }
  }
}

export const voiceReadController = new VoiceReadController();
