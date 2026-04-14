// src/process/team/mcp/tcpHelpers.ts
//
// Shared TCP message helpers for MCP servers (TeamMcpServer and TeamGuideMcpServer).
// Provides length-prefixed JSON message framing over TCP sockets.

import type * as net from 'node:net';
import * as path from 'node:path';

/**
 * Write a JSON message to a TCP socket with length-prefix framing.
 * Format: 4-byte big-endian length header + UTF-8 JSON body.
 */
export function writeTcpMessage(socket: net.Socket, data: unknown): void {
  const json = JSON.stringify(data);
  const body = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
}

/**
 * Create a TCP data handler that reads length-prefixed JSON messages.
 * Returns a function suitable for socket.on('data', ...).
 */
export function createTcpMessageReader(onMessage: (msg: unknown) => void): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const bodyLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + bodyLen) break;

      const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
      buffer = buffer.subarray(4 + bodyLen);

      try {
        const msg = JSON.parse(jsonStr);
        onMessage(msg);
      } catch {
        // Malformed JSON — skip
      }
    }
  };
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
