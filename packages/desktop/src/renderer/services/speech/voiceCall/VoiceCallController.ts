/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import { emitter } from '@/renderer/utils/emitter';
import { voiceReadController, type VoiceReadSnapshot } from '../voiceRead';
import { isCurrentVoiceCallGeneration } from './generation';

export type VoiceCallStatus = 'idle' | 'starting' | 'listening' | 'transcribing' | 'waiting' | 'speaking' | 'error';

export type VoiceCallSnapshot = {
  status: VoiceCallStatus;
  conversationId: string | null;
  sessionId: string | null;
  generation: number;
  activeTurnId: string | null;
  liveTranscript: string;
  lastTranscript: string;
  error: string | null;
};

type SnapshotListener = (snapshot: VoiceCallSnapshot) => void;

const INITIAL_SNAPSHOT: VoiceCallSnapshot = {
  status: 'idle',
  conversationId: null,
  sessionId: null,
  generation: 0,
  activeTurnId: null,
  liveTranscript: '',
  lastTranscript: '',
  error: null,
};

const extractChunk = (data: unknown): string => {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object' && 'content' in data) {
    const content = (data as { content?: unknown }).content;
    return typeof content === 'string' ? content : '';
  }
  return '';
};

class VoiceCallController {
  private snapshot: VoiceCallSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<SnapshotListener>();
  private offStream: (() => void) | null = null;
  private offVoiceRead: (() => void) | null = null;
  private activeMessageId: string | null = null;
  private replyBuffer = '';
  private replyFinished = false;
  private pendingStreamMessages: IResponseMessage[] = [];

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): VoiceCallSnapshot {
    return this.snapshot;
  }

  private patch(next: Partial<VoiceCallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private resetTurn(): void {
    this.activeMessageId = null;
    this.replyBuffer = '';
    this.replyFinished = false;
    this.pendingStreamMessages = [];
  }

  start(conversationId: string): void {
    this.stop();
    const sessionId = uuid();
    this.snapshot = {
      ...INITIAL_SNAPSHOT,
      status: 'starting',
      conversationId,
      sessionId,
    };
    this.offStream = ipcBridge.conversation.responseStream.on((message) => this.handleStream(message));
    this.offVoiceRead = voiceReadController.subscribe((voiceSnapshot) => this.handleVoiceRead(voiceSnapshot));
    voiceReadController.init();
    voiceReadController.setAutoEnabled(false);
    this.patch({ status: 'listening' });
  }

  stop(): void {
    this.offStream?.();
    this.offVoiceRead?.();
    this.offStream = null;
    this.offVoiceRead = null;
    this.resetTurn();
    voiceReadController.stop();
    this.snapshot = INITIAL_SNAPSHOT;
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  setLiveTranscript(text: string | null): void {
    if (!this.snapshot.sessionId) return;
    this.patch({ liveTranscript: text ?? '' });
  }

  markRecording(): void {
    if (!this.snapshot.sessionId || this.snapshot.status === 'listening') return;
    this.patch({ status: 'listening', error: null });
  }

  markTranscribing(): void {
    if (!this.snapshot.sessionId) return;
    this.patch({ status: 'transcribing' });
  }

  fail(error: string): void {
    if (!this.snapshot.sessionId) return;
    this.patch({ status: 'error', error, liveTranscript: '' });
  }

  retryListening(): void {
    if (!this.snapshot.sessionId) return;
    this.resetTurn();
    this.patch({ status: 'listening', error: null, liveTranscript: '' });
  }

  submitTranscript(transcript: string): void {
    const text = transcript.trim();
    const { conversationId, sessionId } = this.snapshot;
    if (!conversationId || !sessionId) return;
    if (!text) {
      this.patch({ status: 'listening', liveTranscript: '' });
      return;
    }

    const generation = this.snapshot.generation + 1;
    this.resetTurn();
    this.patch({
      status: 'waiting',
      generation,
      activeTurnId: null,
      liveTranscript: '',
      lastTranscript: text,
      error: null,
    });

    emitter.emit('voiceCall.send', {
      conversationId,
      sessionId,
      generation,
      text,
      onAccepted: (result) => {
        if (!isCurrentVoiceCallGeneration(this.snapshot, sessionId, generation)) return;
        this.patch({ activeTurnId: result.turn_id });
        const pending = this.pendingStreamMessages;
        this.pendingStreamMessages = [];
        pending.forEach((message) => this.processStream(message));
      },
      onError: (error) => {
        if (!isCurrentVoiceCallGeneration(this.snapshot, sessionId, generation)) return;
        this.fail(error instanceof Error ? error.message : String(error));
      },
    });
  }

  interrupt(): void {
    const { conversationId, sessionId, activeTurnId } = this.snapshot;
    if (!conversationId || !sessionId) return;
    const generation = this.snapshot.generation + 1;
    voiceReadController.stop();
    this.resetTurn();
    this.patch({
      status: 'starting',
      generation,
      activeTurnId: null,
      liveTranscript: '',
      error: null,
    });

    const resume = () => {
      if (!isCurrentVoiceCallGeneration(this.snapshot, sessionId, generation)) return;
      this.patch({ status: 'listening' });
    };

    if (!activeTurnId) {
      resume();
      return;
    }

    emitter.emit('voiceCall.cancel', {
      conversationId,
      sessionId,
      generation,
      turnId: activeTurnId,
      onStopped: resume,
      onError: resume,
    });
  }

  private handleStream(message: IResponseMessage): void {
    if (!this.snapshot.sessionId || message.conversation_id !== this.snapshot.conversationId) return;
    if (!this.snapshot.activeTurnId) {
      if (this.snapshot.status === 'waiting' && this.pendingStreamMessages.length < 100) {
        this.pendingStreamMessages.push(message);
      }
      return;
    }
    this.processStream(message);
  }

  private processStream(message: IResponseMessage): void {
    const activeTurnId = this.snapshot.activeTurnId;
    if (!activeTurnId) return;
    if (message.turn_id && message.turn_id !== activeTurnId) return;
    if (!message.turn_id && (!this.activeMessageId || message.msg_id !== this.activeMessageId)) return;

    if (message.type === 'content' || message.type === 'text') {
      const chunk = extractChunk(message.data);
      if (!chunk) return;
      if (this.activeMessageId && this.activeMessageId !== message.msg_id) return;
      this.activeMessageId = message.msg_id;
      this.replyBuffer = message.replace ? chunk : `${this.replyBuffer}${chunk}`;
      voiceReadController.readCallStreamChunk(message.conversation_id, message.msg_id, this.replyBuffer);
      this.patch({ status: 'speaking' });
      return;
    }

    if (message.type === 'finish' && this.activeMessageId === message.msg_id) {
      this.replyFinished = true;
      voiceReadController.onStreamFinish(message.conversation_id, message.msg_id, this.replyBuffer);
      if (voiceReadController.getSnapshot().status === 'idle') {
        this.beginListeningAfterReply();
      }
      return;
    }

    if (message.type === 'error' && (!this.activeMessageId || this.activeMessageId === message.msg_id)) {
      this.replyFinished = true;
      if (this.activeMessageId) {
        voiceReadController.onStreamError(message.conversation_id, this.activeMessageId);
      }
      this.fail('通话回复失败，请重试');
    }
  }

  private handleVoiceRead(snapshot: VoiceReadSnapshot): void {
    if (!this.snapshot.sessionId || !this.replyFinished || !this.activeMessageId) return;
    if (snapshot.status === 'idle') {
      this.beginListeningAfterReply();
    }
  }

  private beginListeningAfterReply(): void {
    if (!this.snapshot.sessionId) return;
    this.resetTurn();
    this.patch({ status: 'listening', activeTurnId: null, liveTranscript: '' });
  }
}

export const voiceCallController = new VoiceCallController();
