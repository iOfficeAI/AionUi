import type { Stream } from '@agentclientprotocol/sdk';
import { ndJsonStream } from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

const HIGH_WATER_MARK = 64;

type AnyMessage = Record<string, unknown>;

function safeJsonParse(line: string): AnyMessage | null {
  try {
    return JSON.parse(line) as AnyMessage;
  } catch {
    return null;
  }
}

export class NdjsonTransport {
  /**
   * Create Stream from raw byte streams.
   * Delegates to SDK's ndJsonStream.
   */
  static fromByteStreams(rawWritable: WritableStream<Uint8Array>, rawReadable: ReadableStream<Uint8Array>): Stream {
    return ndJsonStream(rawWritable, rawReadable);
  }

  /**
   * Create Stream from a child process's stdio.
   * Delegates to SDK's ndJsonStream.
   */
  static fromChildProcess(child: ChildProcess): Stream {
    if (!child.stdout || !child.stdin) {
      throw new Error('Child process must be spawned with stdio: pipe');
    }
    const rawReadable = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const rawWritable = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
    return ndJsonStream(rawWritable, rawReadable);
  }

  /**
   * Create Stream from a WebSocket connection.
   * SDK does not provide a WebSocket adapter, so this remains custom.
   */
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
