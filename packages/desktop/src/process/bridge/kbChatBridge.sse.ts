/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SseEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; messageId?: string }
  | { type: 'error'; code?: string; message: string };

export type SseEmitter = (event: SseEvent) => void;

export type SseParser = {
  feed: (chunk: string) => void;
};

const EVENT_SEP = /\r?\n\r?\n/;
const LINE_SEP = /\r?\n/;

/**
 * Minimal SSE parser. Consumes incremental `chunk` strings via `feed` and
 * emits parsed events through the `emit` callback.
 *
 * The parser retains an internal buffer so events split across multiple
 * `feed` calls (network chunks) are reassembled correctly. Only complete
 * events (those followed by a blank line) are emitted; partial data is
 * held until the next feed completes the event.
 *
 * `data:` payloads are first Base64-decoded (UTF-8 safe) before JSON parse,
 * because the upstream backend wraps JSON as base64 to avoid UTF-8 byte
 * confusion in older SSE clients.
 *
 * The upstream currently emits a non-streaming shape:
 *   { done?: boolean, message: { content: string, ... } }
 * For forward compatibility (and to keep existing unit tests honest),
 * payloads in the protocol-native shape are also accepted and forwarded
 * verbatim:
 *   { type: 'delta', content: string }
 *   { type: 'done',   messageId?: string }
 *   { type: 'error',  code?: string, message: string }
 *
 * Normalization:
 *   - { done: true, message.content }  → emit 'delta' (full content) then 'done'
 *   - { message.content }              → emit 'delta'
 *   - native shape                     → forwarded as-is
 *   - anything else                    → emit 'error' with 'parse' code
 */
export const createSseParser = (emit: SseEmitter): SseParser => {
  let buffer = '';

  const decodeBase64 = (s: string): string => Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');

  const emitNormalized = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') {
      emit({ type: 'error', code: 'parse', message: 'Unexpected SSE payload shape' });
      return;
    }

    const o = obj as {
      type?: unknown;
      done?: unknown;
      message?: { content?: unknown };
      content?: unknown;
      messageId?: unknown;
      code?: unknown;
    };

    // Native protocol shape — forward as-is.
    if (o.type === 'delta' && typeof o.content === 'string') {
      emit({ type: 'delta', content: o.content });
      return;
    }
    if (o.type === 'done') {
      emit({ type: 'done', messageId: typeof o.messageId === 'string' ? o.messageId : undefined });
      return;
    }
    if (o.type === 'error') {
      emit({
        type: 'error',
        code: typeof o.code === 'string' ? o.code : undefined,
        message: typeof o.message === 'string' ? o.message : 'unknown',
      });
      return;
    }

    // Backend non-streaming shape.
    const content =
      o.message && typeof o.message === 'object' && typeof o.message.content === 'string' ? o.message.content : null;
    if (typeof content === 'string') {
      emit({ type: 'delta', content });
      if (o.done === true) {
        emit({ type: 'done' });
      }
      return;
    }

    emit({ type: 'error', code: 'parse', message: 'Unexpected SSE payload shape' });
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const parts = buffer.split(EVENT_SEP);
      // Keep the trailing partial (after the last separator) for the next feed.
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (part.trim() === '') continue;
        const dataLines: string[] = [];
        for (const line of part.split(LINE_SEP)) {
          if (line.startsWith(':')) continue;
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        const joined = dataLines.join('\n');
        if (joined === '') continue;

        let decoded: unknown;
        try {
          decoded = JSON.parse(decodeBase64(joined));
        } catch (err) {
          // Fall back to the raw payload: the upstream backend may emit
          // either base64-encoded JSON or plain JSON. The first attempt
          // treats the payload as base64; if that fails, try it as-is.
          try {
            decoded = JSON.parse(joined);
          } catch {
            emit({ type: 'error', code: 'parse', message: `Invalid SSE JSON: ${(err as Error).message}` });
            continue;
          }
        }

        emitNormalized(decoded);
      }
    },
  };
};
