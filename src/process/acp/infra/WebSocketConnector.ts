// src/process/acp/infra/WebSocketConnector.ts

import type { ConnectorHandle } from '@process/acp/infra/IAgentConnector';
import type { Stream } from '@agentclientprotocol/sdk';
import { AcpError } from '@process/acp/errors/AcpError';
import { NdjsonTransport } from '@process/acp/infra/NdjsonTransport';

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', (e) => reject(e), { once: true });
  });
}

export type WebSocketConnectorConfig = {
  url: string;
  headers?: Record<string, string>;
};

export class WebSocketConnector {
  private ws: WebSocket | null = null;

  constructor(private readonly config: WebSocketConnectorConfig) {}

  async connect(): Promise<ConnectorHandle> {
    try {
      const ws = new WebSocket(this.config.url);
      await waitForOpen(ws);
      this.ws = ws;
      const stream: Stream = NdjsonTransport.fromWebSocket(ws);
      return {
        stream,
        shutdown: async () => {
          return new Promise<void>((resolve) => {
            if (ws.readyState === WebSocket.CLOSED) return resolve();
            ws.addEventListener('close', () => resolve(), { once: true });
            ws.close();
            setTimeout(resolve, 3000);
          }).then(() => {
            this.ws = null;
          });
        },
      };
    } catch (err) {
      this.ws = null;
      throw new AcpError('CONNECTION_FAILED', `WebSocket failed: ${(err as Error).message}`, {
        cause: err,
        retryable: true,
      });
    }
  }

  isAlive(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
