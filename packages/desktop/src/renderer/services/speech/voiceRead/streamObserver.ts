/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stream observer for the voice-read feature.
 *
 * Pure subscription to ipcBridge.conversation.responseStream (wsEmitter
 * supports multiple subscribers) — it only WATCHES the stream, accumulates
 * the raw text per message (mirroring the buffer-merge in useAionrsMessage)
 * and hands the growing text to VoiceReadController. Nothing is written back
 * into any store/reducer and no speech side effect happens here.
 */

import { ipcBridge } from '@/common';
import { voiceReadController } from './VoiceReadController';

const buffers = new Map<string, string>(); // `${conversationId}:${msg_id}` -> accumulated text

const extractChunk = (data: unknown): string => {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object' && 'content' in data) {
    const content = (data as { content?: unknown }).content;
    if (typeof content === 'string') return content;
  }
  return '';
};

export function attachVoiceReadStreamObserver(conversationId: string): () => void {
  voiceReadController.init();
  voiceReadController.attachConversation(conversationId);

  const unsubscribe = ipcBridge.conversation.responseStream.on((message) => {
    if (message.conversation_id !== conversationId || !message.msg_id) return;

    if (message.type === 'content' || message.type === 'text') {
      const chunk = extractChunk(message.data);
      if (!chunk) return;
      const key = `${conversationId}:${message.msg_id}`;
      const full = (buffers.get(key) ?? '') + chunk;
      buffers.set(key, full);
      voiceReadController.onStreamChunk(conversationId, message.msg_id, full);
      return;
    }

    if (message.type === 'finish') {
      const key = `${conversationId}:${message.msg_id}`;
      const full = buffers.get(key);
      if (full !== undefined) {
        buffers.delete(key);
        voiceReadController.onStreamFinish(conversationId, message.msg_id, full);
      }
      return;
    }

    if (message.type === 'error') {
      const key = `${conversationId}:${message.msg_id}`;
      if (buffers.delete(key)) {
        voiceReadController.onStreamError(conversationId, message.msg_id);
      }
    }
  });

  return () => {
    unsubscribe();
    for (const key of [...buffers.keys()]) {
      if (key.startsWith(`${conversationId}:`)) buffers.delete(key);
    }
    voiceReadController.detachConversation(conversationId);
  };
}
