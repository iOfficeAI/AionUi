/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { ipcBridge } from '@/common';
import { KB_CHAT_FIRST_BYTE_TIMEOUT_MS, KB_CHAT_TOTAL_TIMEOUT_MS, getKbChatSseUrl } from '@/common/config/kbChat.config';
import { createSseParser, type SseEvent } from './kbChatBridge.sse';

export type KbChatSendParams = { requestId: string; kbId: string; question: string; token: string };
export type KbChatAbortParams = { requestId: string };
export type KbChatSendResult = { requestId: string; ok: true } | { ok: false; message: string };
export type KbChatAbortResult = { ok: true };

const inFlight = new Map<string, http.ClientRequest>();

const emitChunk = (requestId: string, content: string): void => {
  ipcBridge.kbChat.streamChunk.emit({ requestId, content });
};

const emitEnd = (requestId: string, reason: 'done' | 'aborted' | 'error'): void => {
  ipcBridge.kbChat.streamEnd.emit({ requestId, reason });
};

const emitError = (requestId: string, code: string, message: string): void => {
  ipcBridge.kbChat.streamError.emit({ requestId, code, message });
};

const performRequest = (params: KbChatSendParams): Promise<KbChatSendResult> => {
  const { requestId, kbId, question, token } = params;
  let parsed: URL;
  try {
    parsed = new URL(getKbChatSseUrl());
  } catch {
    return Promise.resolve({ ok: false, message: 'Invalid KB_CHAT_SSE_URL' });
  }

  const lib = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(
      {
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          emitError(requestId, 'http', `HTTP ${status}`);
          emitEnd(requestId, 'error');
          res.resume();
          inFlight.delete(requestId);
          resolve({ requestId, ok: true });
          return;
        }
        const contentType = String(res.headers['content-type'] ?? '');
        if (!contentType.startsWith('text/event-stream')) {
          emitError(requestId, 'http_bad_content_type', `Unexpected content-type: ${contentType}`);
          emitEnd(requestId, 'error');
          res.resume();
          inFlight.delete(requestId);
          resolve({ requestId, ok: true });
          return;
        }

        const firstByteTimer = setTimeout(() => {
          emitError(requestId, 'timeout_first_byte', 'No response within first-byte timeout');
          emitEnd(requestId, 'error');
          req.destroy();
          inFlight.delete(requestId);
        }, KB_CHAT_FIRST_BYTE_TIMEOUT_MS);

        const totalTimer = setTimeout(() => {
          emitError(requestId, 'timeout_total', 'Total timeout exceeded');
          emitEnd(requestId, 'error');
          req.destroy();
          inFlight.delete(requestId);
        }, KB_CHAT_TOTAL_TIMEOUT_MS);

        let sawDone = false;

        const parser = createSseParser((event: SseEvent) => {
          if (event.type === 'delta') {
            emitChunk(requestId, event.content);
          } else if (event.type === 'done') {
            sawDone = true;
          } else {
            // event.type === 'error' (business error)
            emitError(requestId, event.code ?? 'business', event.message);
          }
        });

        res.on('data', (chunk: Buffer) => {
          clearTimeout(firstByteTimer);
          parser.feed(chunk.toString('utf8'));
        });

        res.on('end', () => {
          clearTimeout(firstByteTimer);
          clearTimeout(totalTimer);
          inFlight.delete(requestId);
          if (!sawDone) {
            emitError(requestId, 'incomplete', 'Stream ended without done event');
          }
          emitEnd(requestId, sawDone ? 'done' : 'error');
        });

        res.on('error', (err) => {
          clearTimeout(firstByteTimer);
          clearTimeout(totalTimer);
          inFlight.delete(requestId);
          emitError(requestId, 'network', err.message);
          emitEnd(requestId, 'error');
        });
      }
    );

    req.on('error', (err) => {
      inFlight.delete(requestId);
      emitError(requestId, 'network', err.message);
      emitEnd(requestId, 'error');
    });

    inFlight.set(requestId, req);
    req.write(JSON.stringify({ kbId, question }));
    req.end();

    resolve({ requestId, ok: true });
  });
};

export const sendKbChat = async (params: KbChatSendParams): Promise<KbChatSendResult> => {
  if (!params.requestId || !params.kbId || !params.question || !params.token) {
    return { ok: false, message: 'Missing required field' };
  }
  const existing = inFlight.get(params.requestId);
  if (existing) existing.destroy();
  return performRequest(params);
};

export const abortKbChat = async (params: KbChatAbortParams): Promise<KbChatAbortResult> => {
  const req = inFlight.get(params.requestId);
  if (req) {
    req.destroy();
    inFlight.delete(params.requestId);
    emitEnd(params.requestId, 'aborted');
  }
  return { ok: true };
};

export const _resetForTest = (): void => {
  for (const req of inFlight.values()) req.destroy();
  inFlight.clear();
};

/**
 * Register the KB chat handlers with the IPC bridge. Called once at startup.
 */
export const registerKbChatBridge = (): void => {
  ipcBridge.kbChat.send.provider(sendKbChat);
  ipcBridge.kbChat.abort.provider(abortKbChat);
};