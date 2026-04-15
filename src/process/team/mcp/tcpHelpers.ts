// src/process/team/mcp/tcpHelpers.ts
//
// Shared TCP message helpers for MCP servers (TeamMcpServer and TeamGuideMcpServer)
// and their stdio bridges (teamMcpStdio, teamGuideMcpStdio).
// Provides length-prefixed JSON message framing over TCP sockets.

import * as net from 'node:net';
import * as path from 'node:path';

/**
 * Hard cap on a single framed TCP message body.
 * The wire length prefix is an unvalidated 32-bit unsigned int (up to 4 GB),
 * so without a cap a corrupted or hostile prefix would let the reader grow its
 * buffer until the process is OOM-killed. 64 MB comfortably fits any normal
 * MCP tool response (including base64-encoded images of typical sizes) while
 * preventing pathological growth.
 */
export const MAX_MCP_MESSAGE_SIZE = 64 * 1024 * 1024;

/**
 * Write a JSON message to a TCP socket with length-prefix framing.
 * Format: 4-byte big-endian length header + UTF-8 JSON body.
 *
 * Allocates a single combined frame to avoid the cost of two writes
 * and to give the kernel one contiguous buffer.
 */
export function writeTcpMessage(socket: net.Socket, data: unknown): void {
  const body = Buffer.from(JSON.stringify(data), 'utf-8');
  const frame = Buffer.allocUnsafe(4 + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  socket.write(frame);
}

export interface CreateTcpMessageReaderOptions {
  /** Max single message body size; defaults to MAX_MCP_MESSAGE_SIZE. */
  maxBodyBytes?: number;
  /**
   * Called when an unrecoverable framing error occurs (oversize body, etc.).
   * The caller is expected to close/destroy the socket.
   */
  onError?: (err: Error) => void;
}

/**
 * Create a TCP data handler that reads length-prefixed JSON messages.
 *
 * Implementation note: stores incoming chunks in an array and only concatenates
 * once when a full message is available. The previous implementation did
 * `buffer = Buffer.concat([buffer, chunk])` on every chunk, which is O(N^2)
 * in the message size — a 100 MB response arriving in 10 KB chunks allocated
 * roughly 5 GB of transient buffers and was responsible for the commit-charge
 * blow-up that froze the host on 2026-04-14.
 *
 * Now total work per message is O(N), and an oversize length prefix is
 * rejected immediately instead of waiting forever for bytes that never arrive.
 */
export function createTcpMessageReader(
  onMessage: (msg: unknown) => void,
  options: CreateTcpMessageReaderOptions = {}
): (chunk: Buffer) => void {
  const maxBodyBytes = options.maxBodyBytes ?? MAX_MCP_MESSAGE_SIZE;
  const onError = options.onError;

  const chunks: Buffer[] = [];
  let total = 0;
  let aborted = false;

  return (chunk: Buffer) => {
    if (aborted) return;
    chunks.push(chunk);
    total += chunk.length;

    while (total >= 4) {
      const bodyLen = peekUInt32BE(chunks);

      if (bodyLen > maxBodyBytes) {
        aborted = true;
        chunks.length = 0;
        total = 0;
        const err = new Error(`TCP message length ${bodyLen} exceeds max ${maxBodyBytes}`);
        if (onError) onError(err);
        return;
      }

      const frameLen = 4 + bodyLen;
      if (total < frameLen) break;

      const frame = takeBytes(chunks, frameLen);
      total -= frameLen;

      const jsonStr = frame.subarray(4).toString('utf-8');
      try {
        onMessage(JSON.parse(jsonStr));
      } catch {
        // Malformed JSON — skip this message but keep reading the next one.
      }
    }
  };
}

/** Read a big-endian uint32 from the front of `chunks` without consuming them. */
function peekUInt32BE(chunks: Buffer[]): number {
  const first = chunks[0];
  if (first.length >= 4) return first.readUInt32BE(0);
  // Rare: length prefix straddles two chunks.
  const header = Buffer.allocUnsafe(4);
  let filled = 0;
  for (const c of chunks) {
    const copy = Math.min(c.length, 4 - filled);
    c.copy(header, filled, 0, copy);
    filled += copy;
    if (filled >= 4) break;
  }
  return header.readUInt32BE(0);
}

/** Remove and return the first `n` bytes from `chunks` as a single Buffer. */
function takeBytes(chunks: Buffer[], n: number): Buffer {
  const out = Buffer.allocUnsafe(n);
  let filled = 0;
  while (filled < n && chunks.length > 0) {
    const c = chunks[0];
    const need = n - filled;
    if (c.length <= need) {
      c.copy(out, filled);
      filled += c.length;
      chunks.shift();
    } else {
      c.copy(out, filled, 0, need);
      chunks[0] = c.subarray(need);
      filled += need;
    }
  }
  return out;
}

/**
 * Open a TCP connection, send one framed JSON request, await one framed JSON
 * response, then close the connection. Used by the stdio MCP bridges.
 *
 * Replaces the previous per-bridge inline implementations, which had the same
 * O(N^2) Buffer.concat bug as the server-side reader.
 */
export function sendTcpRequest<T = { result?: string; error?: string }>(
  port: number,
  data: unknown,
  options: { timeoutMs?: number; maxBodyBytes?: number; host?: string } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_MCP_MESSAGE_SIZE;
  const host = options.host ?? '127.0.0.1';

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const socket = net.createConnection({ host, port }, () => {
      writeTcpMessage(socket, data);
    });

    const finish = (err: Error | null, value?: T): void => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      if (err) reject(err);
      else resolve(value as T);
    };

    const reader = createTcpMessageReader((msg) => finish(null, msg as T), {
      maxBodyBytes,
      onError: (err) => finish(err),
    });

    socket.on('data', reader);
    socket.on('end', () => finish(new Error('TCP connection ended before response')));
    socket.on('error', (err) => finish(err));

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(new Error('TCP request timeout')));
  });
}

/**
 * Resolve the directory containing MCP stdio scripts (team-mcp-stdio.js / team-guide-mcp-stdio.js).
 * Mirrors the getBuiltinMcpBaseDir() logic in initStorage.ts so both MCP
 * scripts use the same path strategy across dev and packaged modes.
 *
 * In dev:       out/main/  (next to the main bundle)
 * In packaged:  app.asar.unpacked/out/main/  (asarUnpack makes it a real file)
 */
export function resolveMcpScriptDir(): string {
  const mainModuleDir =
    typeof require !== 'undefined' && require.main?.filename ? path.dirname(require.main.filename) : __dirname;
  const baseDir = path.basename(mainModuleDir) === 'chunks' ? path.dirname(mainModuleDir) : mainModuleDir;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    if (app.isPackaged) {
      return baseDir.replace('app.asar', 'app.asar.unpacked');
    }
  } catch {
    // Not in Electron (unit tests / CLI mode) — use baseDir as-is
  }
  return baseDir;
}
