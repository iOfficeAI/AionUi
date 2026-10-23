/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';
import type { GatewayStore } from './gatewayStore';
import type { ComboRouter, ChatCompletionRequest } from './comboRouter';
import {
  transformAnthropicSseLine,
  convertAnthropicToOpenAiResponse,
  type AnthropicStreamState,
} from './anthropicAdapter';

export class GatewayServer {
  private server: http.Server | null = null;
  private store: GatewayStore;
  private router: ComboRouter;
  private port = 13408;

  constructor(store: GatewayStore, router: ComboRouter) {
    this.store = store;
    this.router = router;
  }

  getPort(): number {
    return this.port;
  }

  start(preferredPort = 13408): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

        // Health check
        if (url.pathname === '/health' || url.pathname === '/v1/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', port: this.port }));
          return;
        }

        // List models / combos
        if (url.pathname === '/v1/models' && req.method === 'GET') {
          const combos = this.store.getCombos().filter((c) => c.enabled);
          const accounts = this.store.getAccounts().filter((a) => a.enabled);

          const modelItems: Array<{ id: string; object: string; created: number; owned_by: string }> = [];

          // Add combos as models
          for (const c of combos) {
            modelItems.push({
              id: c.name,
              object: 'model',
              created: Math.floor(Date.now() / 1000),
              owned_by: 'aionui-combo',
            });
            if (c.id !== c.name) {
              modelItems.push({
                id: c.id,
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: 'aionui-combo',
              });
            }
          }

          // Add unique models from accounts
          const seen = new Set<string>();
          for (const acc of accounts) {
            for (const m of acc.models) {
              if (!seen.has(m)) {
                seen.add(m);
                modelItems.push({
                  id: m,
                  object: 'model',
                  created: Math.floor(Date.now() / 1000),
                  owned_by: acc.name,
                });
              }
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ object: 'list', data: modelItems }));
          return;
        }

        // Chat completions
        if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });

          req.on('end', async () => {
            try {
              const reqBody: ChatCompletionRequest = JSON.parse(body);
              const startTime = Date.now();

              // If streaming requested, pipe upstream stream
              if (reqBody.stream) {
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  Connection: 'keep-alive',
                });

                let totalPromptTokens = 0;
                let totalCompletionTokens = 0;
                let totalCachedTokens = 0;
                let thoughtTokens = 0;

                const { response, targetAccount, targetModel, isAnthropic } = await this.router.executeChat(
                  reqBody,
                  (chunk) => res.write(chunk)
                );

                if (response.body) {
                  const reader = response.body.getReader();
                  const decoder = new TextDecoder();

                  try {
                    if (isAnthropic) {
                      const anthropicState: AnthropicStreamState = {
                        id: `ant-${Date.now()}`,
                        model: targetModel,
                        inputTokens: 0,
                        outputTokens: 0,
                        cachedTokens: 0,
                        thoughtTokens: 0,
                      };
                      let buffer = '';

                      while (true) {
                        // oxlint-disable-next-line eslint/no-await-in-loop
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                          transformAnthropicSseLine(line, anthropicState, (chunk) => res.write(chunk));
                        }
                      }
                      totalPromptTokens = anthropicState.inputTokens;
                      totalCompletionTokens = anthropicState.outputTokens;
                      totalCachedTokens = anthropicState.cachedTokens;
                      thoughtTokens = anthropicState.thoughtTokens;
                    } else {
                      // Standard OpenAI stream
                      while (true) {
                        // oxlint-disable-next-line eslint/no-await-in-loop
                        const { done, value } = await reader.read();
                        if (done) break;

                        const textChunk = decoder.decode(value, { stream: true });
                        res.write(textChunk);

                        const lines = textChunk.split('\n');
                        for (const line of lines) {
                          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                            try {
                              const parsed = JSON.parse(line.slice(6));
                              if (parsed.usage) {
                                totalPromptTokens = parsed.usage.prompt_tokens || totalPromptTokens;
                                totalCompletionTokens = parsed.usage.completion_tokens || totalCompletionTokens;
                                totalCachedTokens =
                                  parsed.usage.prompt_tokens_details?.cached_tokens ||
                                  parsed.usage.cached_tokens ||
                                  totalCachedTokens;
                                thoughtTokens =
                                  parsed.usage.completion_tokens_details?.reasoning_tokens || thoughtTokens;
                              }
                            } catch {
                              // Non-json SSE data line
                            }
                          }
                        }
                      }
                    }
                  } finally {
                    res.end();
                  }

                  // If usage wasn't reported by upstream, estimate roughly
                  if (totalPromptTokens === 0 && totalCompletionTokens === 0) {
                    const promptStr = JSON.stringify(reqBody.messages || '');
                    totalPromptTokens = Math.max(1, Math.round(promptStr.length / 4));
                    totalCompletionTokens = Math.max(1, Math.round(textChunkLengthEstimate / 4));
                  }

                  this.router.logExecution({
                    startTime,
                    reqModel: reqBody.model,
                    resolvedAccount: targetAccount,
                    resolvedModel: targetModel,
                    fallbackAttempts: [],
                    tokens: {
                      promptTokens: totalPromptTokens,
                      completionTokens: totalCompletionTokens,
                      cachedTokens: totalCachedTokens,
                      thoughtTokens,
                      totalTokens: totalPromptTokens + totalCompletionTokens,
                    },
                    statusCode: 200,
                    status: 'success',
                  });
                } else {
                  res.end();
                }
                return;
              }

              // Non-streaming request
              const { response, targetAccount, targetModel, isAnthropic } = await this.router.executeChat(reqBody);
              const rawData = await response.json();
              const data = isAnthropic
                ? convertAnthropicToOpenAiResponse(rawData as Record<string, unknown>, targetModel)
                : rawData;

              let promptTokens = 0;
              let completionTokens = 0;
              let cachedTokens = 0;
              let thoughtTokens = 0;

              if (data && typeof data === 'object' && 'usage' in data) {
                const u = (data as { usage: Record<string, unknown> }).usage;
                promptTokens = Number(u.prompt_tokens) || 0;
                completionTokens = Number(u.completion_tokens) || 0;
                const details = u.prompt_tokens_details as Record<string, unknown> | undefined;
                cachedTokens = Number(details?.cached_tokens || u.cached_tokens) || 0;
                const cDetails = u.completion_tokens_details as Record<string, unknown> | undefined;
                thoughtTokens = Number(cDetails?.reasoning_tokens) || 0;
              }

              this.router.logExecution({
                startTime,
                reqModel: reqBody.model,
                resolvedAccount: targetAccount,
                resolvedModel: targetModel,
                fallbackAttempts: [],
                tokens: {
                  promptTokens,
                  completionTokens,
                  cachedTokens,
                  thoughtTokens,
                  totalTokens: promptTokens + completionTokens,
                },
                statusCode: response.status,
                status: 'success',
              });

              res.writeHead(response.status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error('[GatewayServer] Error processing chat completion:', err);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    error: { message: msg, type: 'gateway_error', code: 500 },
                  })
                );
              }
            }
          });
          return;
        }

        // 404 Not Found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[GatewayServer] Port ${preferredPort} in use, trying next port...`);
          this.port = preferredPort + 1;
          this.server?.listen(this.port, '127.0.0.1');
        } else {
          reject(err);
        }
      });

      this.port = preferredPort;
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[GatewayServer] AionUi Native Gateway listening on http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Helper for estimate fallback
let textChunkLengthEstimate = 0;
