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
 */
export const createSseParser = (emit: SseEmitter): SseParser => {
  let buffer = '';

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
        try {
          const parsed = JSON.parse(joined) as SseEvent;
          emit(parsed);
        } catch {
          emit({ type: 'error', code: 'parse', message: 'Invalid SSE JSON' });
        }
      }
    },
  };
};
