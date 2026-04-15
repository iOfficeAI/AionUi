import type { ChildProcess } from 'node:child_process';
import type { Stream } from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';

const HIGH_WATER_MARK = 64; // D6 decision

type AnyMessage = Record<string, unknown>;

function safeJsonParse(line: string): AnyMessage | null {
  try {
    return JSON.parse(line) as AnyMessage;
  } catch {
    return null;
  }
}

export class NdjsonTransport {
  static fromByteStreams(rawWritable: WritableStream<Uint8Array>, rawReadable: ReadableStream<Uint8Array>): Stream {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream<AnyMessage>(
      {
        async start(controller) {
          const reader = rawReadable.getReader();
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop()!;
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.length === 0) continue;
                const msg = safeJsonParse(trimmed);
                if (msg) controller.enqueue(msg);
              }
            }
            if (buffer.trim().length > 0) {
              const msg = safeJsonParse(buffer.trim());
              if (msg) controller.enqueue(msg);
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          } finally {
            reader.releaseLock();
          }
        },
      },
      new CountQueuingStrategy({ highWaterMark: HIGH_WATER_MARK })
    );

    const writer = rawWritable.getWriter();
    const writable = new WritableStream<AnyMessage>({
      async write(message) {
        const line = JSON.stringify(message) + '\n';
        await writer.write(encoder.encode(line));
      },
      close() {
        return writer.close();
      },
      abort(reason) {
        return writer.abort(reason);
      },
    });

    return { readable, writable } as Stream;
  }

  static fromChildProcess(child: ChildProcess): Stream {
    const stdout = child.stdout!;
    const stdin = child.stdin!;
    const rawReadable = Readable.toWeb(stdout) as ReadableStream<Uint8Array>;
    const rawWritable = Writable.toWeb(stdin) as WritableStream<Uint8Array>;
    return NdjsonTransport.fromByteStreams(rawWritable, rawReadable);
  }

  static fromWebSocket(ws: WebSocket): Stream {
    const readable = new ReadableStream<AnyMessage>(
      {
        start(controller) {
          ws.addEventListener('message', (event) => {
            const data = typeof event.data === 'string' ? event.data : '';
            for (const line of data.split('\n')) {
              const trimmed = line.trim();
              if (trimmed.length === 0) continue;
              const msg = safeJsonParse(trimmed);
              if (msg) controller.enqueue(msg);
            }
          });
          ws.addEventListener('close', () => controller.close());
          ws.addEventListener('error', (e) => controller.error(e));
        },
      },
      new CountQueuingStrategy({ highWaterMark: HIGH_WATER_MARK })
    );

    const writable = new WritableStream<AnyMessage>({
      write(message) {
        ws.send(JSON.stringify(message) + '\n');
      },
    });

    return { readable, writable } as Stream;
  }
}
