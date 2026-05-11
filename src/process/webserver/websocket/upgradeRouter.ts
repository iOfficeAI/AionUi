/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingHttpHeaders, IncomingMessage, Server as HttpServer } from 'http';
import http from 'http';
import type { Duplex } from 'stream';
import type { WebSocketServer } from 'ws';
import { WEBUI_BRIDGE_WS_PATH, WEBUI_VITE_HMR_PATH } from '@/common/config/constants';
import { SERVER_CONFIG } from '../config/constants';
import { VITE_DEV_HOST, VITE_DEV_PORT } from '../viteDevServer';

function getUpgradePath(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', SERVER_CONFIG.BASE_URL).pathname;
  } catch {
    return '/';
  }
}

function serializeHeaders(headers: IncomingHttpHeaders): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`${key}: ${item}`);
      }
      continue;
    }
    lines.push(`${key}: ${value}`);
  }
  return lines;
}

function sendBadGateway(socket: Duplex, message = 'Bad Gateway'): void {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 502 ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function proxyViteUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, vitePort = VITE_DEV_PORT): void {
  const proxyReq = http.request({
    hostname: VITE_DEV_HOST,
    port: vitePort,
    path: req.url,
    method: req.method ?? 'GET',
    headers: {
      ...req.headers,
      host: `${VITE_DEV_HOST}:${vitePort}`,
      connection: 'Upgrade',
      upgrade: req.headers.upgrade ?? 'websocket',
    },
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const responseHeaders = [
      `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode ?? 101} ${proxyRes.statusMessage ?? 'Switching Protocols'}`,
      ...serializeHeaders(proxyRes.headers),
      '',
      '',
    ].join('\r\n');

    socket.write(responseHeaders);

    if (proxyHead.length > 0) {
      socket.write(proxyHead);
    }
    if (head.length > 0) {
      proxySocket.write(head);
    }

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('response', (proxyRes) => {
    proxyRes.resume();
    sendBadGateway(socket, proxyRes.statusMessage ?? 'Bad Gateway');
  });

  proxyReq.on('error', () => {
    sendBadGateway(socket);
  });

  proxyReq.end();
}

export function registerWebSocketUpgradeRouter(server: HttpServer, businessWss: WebSocketServer): void {
  server.on('upgrade', (req, socket, head) => {
    const upgradePath = getUpgradePath(req);

    if (upgradePath === WEBUI_BRIDGE_WS_PATH) {
      businessWss.handleUpgrade(req, socket, head, (ws) => {
        businessWss.emit('connection', ws, req);
      });
      return;
    }

    if (upgradePath === WEBUI_VITE_HMR_PATH) {
      proxyViteUpgrade(req, socket, head);
      return;
    }

    socket.destroy();
  });
}
