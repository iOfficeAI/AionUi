/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_THINKING_TEXT = '思考中...';

const STREAM_IDLE_MS = 30_000;
const STREAM_TTL_MS = 5 * 60_000;
const EVENT_TTL_MS = 5 * 60_000;
const RESPONSE_URL_TTL_MS = 55 * 60_000;

export type WecomStreamRecord = {
  streamId: string;
  chatId: string;
  visibleContent: string;
  thinkingContent: string;
  finished: boolean;
  createdAt: number;
  updatedAt: number;
  lastMessageId: string | null;
  finalizedAt: number;
};

/** Surface required by the HTTP webhook handler (implemented by WecomPlugin). */
export type WecomWebhookSurface = {
  verifySignature(signature: string, timestamp: string, nonce: string, encrypted: string): boolean;
  decrypt(encrypted: string): string;
  buildEncryptedStreamResponse(
    streamState: WecomStreamRecord,
    timestamp: string,
    nonce: string
  ): { encrypt: string; msgsignature: string; timestamp: string; nonce: string };
  handleInboundMessage(payload: Record<string, unknown>, streamId: string): Promise<void>;
  isRunning(): boolean;
  metrics: {
    received: number;
    streamRefresh: number;
    sent: number;
    updated: number;
    verified: number;
    lastEventAt: number;
  };
};

let activePlugin: WecomWebhookSurface | null = null;
const streamStore = new Map<string, WecomStreamRecord>();
const eventDeduper = new Map<string, number>();
const responseUrlStore = new Map<string, { url: string; expiresAt: number; used: boolean; createdAt: number }>();

function now(): number {
  return Date.now();
}

export function setActiveWecomPlugin(plugin: WecomWebhookSurface | null): void {
  activePlugin = plugin;
}

export function getActiveWecomPlugin(): WecomWebhookSurface | null {
  return activePlugin;
}

export function createStream(streamId: string, chatId: string, initialText = DEFAULT_THINKING_TEXT): WecomStreamRecord {
  const ts = now();
  const record: WecomStreamRecord = {
    streamId,
    chatId,
    visibleContent: '',
    thinkingContent: initialText || DEFAULT_THINKING_TEXT,
    finished: false,
    createdAt: ts,
    updatedAt: ts,
    lastMessageId: null,
    finalizedAt: 0,
  };
  streamStore.set(streamId, record);
  return record;
}

export function getStream(streamId: string): WecomStreamRecord | null {
  return streamStore.get(streamId) ?? null;
}

export function getLatestStreamByChatId(chatId: string): WecomStreamRecord | null {
  if (!chatId) return null;
  let latest: WecomStreamRecord | null = null;
  for (const stream of streamStore.values()) {
    if (stream.chatId !== chatId) continue;
    if (!latest || stream.updatedAt > latest.updatedAt) {
      latest = stream;
    }
  }
  return latest;
}

export function upsertStreamContent(
  streamId: string,
  payload: Partial<Pick<WecomStreamRecord, 'visibleContent' | 'thinkingContent' | 'lastMessageId' | 'finished'>>
): WecomStreamRecord | null {
  const stream = getStream(streamId);
  if (!stream) return null;
  const updated: WecomStreamRecord = {
    ...stream,
    ...(typeof payload.visibleContent === 'string' && { visibleContent: payload.visibleContent }),
    ...(typeof payload.thinkingContent === 'string' && { thinkingContent: payload.thinkingContent }),
    ...(typeof payload.lastMessageId === 'string' && { lastMessageId: payload.lastMessageId }),
    ...(payload.finished === true && { finished: true, finalizedAt: now() }),
    updatedAt: now(),
  };
  streamStore.set(streamId, updated);
  return updated;
}

export function finishStream(streamId: string): WecomStreamRecord | null {
  return upsertStreamContent(streamId, { finished: true, thinkingContent: '' });
}

export function shouldDropDuplicate(eventId: string): boolean {
  if (!eventId) return false;
  const ts = eventDeduper.get(eventId);
  const current = now();
  if (ts !== undefined && current - ts < EVENT_TTL_MS) {
    return true;
  }
  eventDeduper.set(eventId, current);
  return false;
}

export function registerResponseUrl(chatId: string, responseUrl: string): void {
  const normalizedChatId = String(chatId || '').trim();
  const normalizedUrl = String(responseUrl || '').trim();
  if (!normalizedChatId || !normalizedUrl) return;
  responseUrlStore.set(normalizedChatId, {
    url: normalizedUrl,
    expiresAt: now() + RESPONSE_URL_TTL_MS,
    used: false,
    createdAt: now(),
  });
}

export function consumeResponseUrl(chatId: string): string | null {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) return null;
  const record = responseUrlStore.get(normalizedChatId);
  if (!record) return null;
  if (record.used || record.expiresAt <= now()) {
    responseUrlStore.delete(normalizedChatId);
    return null;
  }
  responseUrlStore.set(normalizedChatId, { ...record, used: true });
  return record.url;
}

export function cleanupExpiredRecords(): void {
  const current = now();

  for (const [eventId, ts] of eventDeduper.entries()) {
    if (current - ts > EVENT_TTL_MS) {
      eventDeduper.delete(eventId);
    }
  }

  for (const [streamId, stream] of streamStore.entries()) {
    const age = current - stream.updatedAt;
    if (stream.finished) {
      if (age > STREAM_IDLE_MS) {
        streamStore.delete(streamId);
      }
      continue;
    }
    if (age > STREAM_TTL_MS) {
      streamStore.delete(streamId);
    }
  }

  for (const [cid, record] of responseUrlStore.entries()) {
    if (record.expiresAt <= current || record.used) {
      responseUrlStore.delete(cid);
    }
  }
}
