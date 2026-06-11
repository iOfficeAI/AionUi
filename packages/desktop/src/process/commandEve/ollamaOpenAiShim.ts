/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import path from 'path';
import {
  evaluateCommandEveEgressBoundary,
  redactCommandEveSensitiveText,
  writeCommandEveEgressBoundaryReceipt,
  type CommandEveEgressPolicyAction,
} from './egressBoundaryCore';

const DEFAULT_SHIM_PORT = 25811;
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_NUM_CTX = 32_768;
const DEFAULT_MAX_TOKENS = 512;

export type CommandEveOllamaShimOptions = {
  port?: number;
  ollamaBaseUrl?: string;
  numCtx?: number;
  maxTokens?: number;
  promptProofPath?: string;
  egressReceiptPath?: string;
  egressPolicyAction?: CommandEveEgressPolicyAction;
};

export type CommandEveModelWarmupOptions = {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
};

export type CommandEveModelWarmupResult = {
  ok: boolean;
  elapsedMs: number;
  model: string;
  error?: string;
};

export type CommandEvePromptProof = {
  version: 'command-eve-prompt-proof/v0';
  ok: boolean;
  observed_at: string;
  model: string;
  message_count: number;
  system_message_count: number;
  marker: 'eve_operating_rule' | 'command_eve_chief_of_staff' | 'command_eve_founder_intent' | 'none';
  prompt_sha256: string;
  roles: string[];
};

let server: http.Server | undefined;
let serverUrl = '';

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname) && Boolean(url.port)
    );
  } catch {
    return false;
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return `${normalized.endsWith('/v1') ? normalized : `${normalized}/v1`}/chat/completions`;
}

function jsonResponse(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 25_000_000) {
        reject(new Error('request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function asMessages(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function messageRole(message: unknown): string {
  if (!message || typeof message !== 'object') return 'unknown';
  const role = (message as Record<string, unknown>).role;
  return typeof role === 'string' && role.trim() ? role.trim().slice(0, 40) : 'unknown';
}

function messageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const text = (part as Record<string, unknown>).text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function redactMessageContent(message: unknown): unknown {
  if (!message || typeof message !== 'object') return message;
  const nextMessage = { ...(message as Record<string, unknown>) };
  const content = nextMessage.content;
  if (typeof content === 'string') {
    nextMessage.content = redactCommandEveSensitiveText(content);
    return nextMessage;
  }
  if (!Array.isArray(content)) return nextMessage;
  nextMessage.content = content.map((part) => {
    if (!part || typeof part !== 'object') return part;
    const nextPart = { ...(part as Record<string, unknown>) };
    if (typeof nextPart.text === 'string') {
      nextPart.text = redactCommandEveSensitiveText(nextPart.text);
    }
    return nextPart;
  });
  return nextMessage;
}

function classifyPromptMarker(promptText: string): CommandEvePromptProof['marker'] {
  if (/\bEVE Operating Rule\b/i.test(promptText)) return 'eve_operating_rule';
  if (/Command EVE'?s Chief-of-Staff/i.test(promptText) || /Command EVE Chief of Staff/i.test(promptText)) {
    return 'command_eve_chief_of_staff';
  }
  if (/Founder Intent/i.test(promptText) && /\bEVE\b/.test(promptText)) return 'command_eve_founder_intent';
  return 'none';
}

export function buildCommandEvePromptProof(body: Record<string, unknown>): CommandEvePromptProof {
  const messages = asMessages(body.messages);
  const roles = messages.map(messageRole);
  const promptText = messages.map(messageText).join('\n\n');
  const marker = classifyPromptMarker(promptText);
  return {
    version: 'command-eve-prompt-proof/v0',
    ok: marker !== 'none',
    observed_at: new Date().toISOString(),
    model: String(body.model || ''),
    message_count: messages.length,
    system_message_count: roles.filter((role) => role === 'system').length,
    marker,
    prompt_sha256: crypto.createHash('sha256').update(promptText).digest('hex'),
    roles,
  };
}

export function isCommandEveWarmupRequest(body: Record<string, unknown>): boolean {
  const messages = asMessages(body.messages);
  if (messages.length !== 1) return false;
  const onlyMessage = messages[0] as Record<string, unknown> | undefined;
  const content = typeof onlyMessage?.content === 'string' ? onlyMessage.content.trim().toLowerCase() : '';
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 0;
  return messageRole(onlyMessage) === 'user' && content === 'ping' && maxTokens > 0 && maxTokens <= 4;
}

function writePromptProof(promptProofPath: string, proof: CommandEvePromptProof): void {
  if (!promptProofPath) return;
  fs.mkdirSync(path.dirname(promptProofPath), { recursive: true });
  const tempFile = `${promptProofPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, promptProofPath);
}

function contextLengthFromModel(model: string, fallback: number): number {
  const match = model.match(/-(\d+)k(?::|$)/i);
  if (!match) return fallback;
  const contextLength = Number(match[1]) * 1024;
  if (!Number.isFinite(contextLength)) return fallback;
  return Math.max(4_096, Math.min(262_144, Math.floor(contextLength)));
}

function nativeChatPayload(body: Record<string, unknown>, options: Required<CommandEveOllamaShimOptions>): unknown {
  const model = String(body.model || '');
  const maxTokens =
    typeof body.max_tokens === 'number' && Number.isFinite(body.max_tokens)
      ? Math.max(1, Math.min(Math.floor(body.max_tokens), options.maxTokens))
      : options.maxTokens;
  return {
    model,
    messages: asMessages(body.messages),
    stream: Boolean(body.stream),
    think: false,
    ...(Array.isArray(body.tools) ? { tools: body.tools } : {}),
    options: {
      num_ctx: contextLengthFromModel(model, options.numCtx),
      num_predict: maxTokens,
    },
  };
}

async function fetchOllama(
  path: string,
  init: RequestInit,
  options: Required<CommandEveOllamaShimOptions>
): Promise<Response> {
  return fetch(`${options.ollamaBaseUrl.replace(/\/+$/, '')}${path}`, init);
}

async function handleModels(response: ServerResponse, options: Required<CommandEveOllamaShimOptions>): Promise<void> {
  const upstream = await fetchOllama('/api/tags', { method: 'GET' }, options);
  const data = (await upstream.json()) as { models?: Array<{ name?: string; modified_at?: string }> };
  jsonResponse(response, 200, {
    object: 'list',
    data: (data.models || []).map((model) => ({
      id: model.name || '',
      object: 'model',
      created: model.modified_at ? Math.floor(Date.parse(model.modified_at) / 1000) : 0,
      owned_by: 'ollama',
    })),
  });
}

function writeStreamChunk(response: ServerResponse, model: string, content: string, toolCalls?: unknown): void {
  const delta: Record<string, unknown> = {};
  if (content) delta.content = content;
  if (toolCalls) delta.tool_calls = toolCalls;
  response.write(
    `data: ${JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta, finish_reason: null }],
    })}\n\n`
  );
}

async function handleChatCompletions(
  request: IncomingMessage,
  response: ServerResponse,
  options: Required<CommandEveOllamaShimOptions>
): Promise<void> {
  const body = await readBody(request);
  const model = String(body.model || '');
  const stream = Boolean(body.stream);
  if (!isCommandEveWarmupRequest(body)) {
    const egressBoundary = await evaluateCommandEveEgressBoundary({
      text: asMessages(body.messages).map(messageText).join('\n\n'),
      provider: {
        kind: 'local',
        name: 'ollama',
        model,
        baseUrl: options.ollamaBaseUrl,
      },
      policyAction: options.egressPolicyAction,
    });
    try {
      writeCommandEveEgressBoundaryReceipt(options.egressReceiptPath, egressBoundary.receipt);
    } catch (error) {
      console.warn('[Command EVE] Failed to write egress boundary receipt:', error);
    }
    response.setHeader('x-command-eve-egress-decision', egressBoundary.decision);
    if (egressBoundary.decision === 'block') {
      jsonResponse(response, 451, {
        error: {
          message:
            'Command EVE blocked sensitive data before model egress. Move secrets into settings, an env file, or an approved vault flow.',
          receipt: egressBoundary.receipt,
        },
      });
      return;
    }
    if (egressBoundary.decision === 'redact') {
      body.messages = asMessages(body.messages).map(redactMessageContent);
    }

    const proof = buildCommandEvePromptProof(body);
    try {
      writePromptProof(options.promptProofPath, proof);
    } catch (error) {
      console.warn('[Command EVE] Failed to write prompt proof receipt:', error);
    }
    response.setHeader('x-command-eve-persona-proof', proof.ok ? proof.prompt_sha256 : 'missing');
    if (!proof.ok) {
      console.warn(`[Command EVE] Prompt proof missing EVE marker for model ${model || 'unknown'}.`);
    }
  }
  const upstream = await fetchOllama(
    '/api/chat',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nativeChatPayload(body, options)),
    },
    options
  );

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    jsonResponse(response, upstream.status || 502, { error: { message: text || 'Ollama request failed' } });
    return;
  }

  if (!stream) {
    const data = (await upstream.json()) as {
      message?: { content?: string; tool_calls?: unknown };
      done_reason?: string;
    };
    jsonResponse(response, 200, {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: data.message?.content || '',
            ...(data.message?.tool_calls ? { tool_calls: data.message.tool_calls } : {}),
          },
          finish_reason: data.done_reason === 'length' ? 'length' : 'stop',
        },
      ],
    });
    return;
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finishReason = 'stop';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as {
        message?: { content?: string; tool_calls?: unknown };
        done?: boolean;
        done_reason?: string;
      };
      if (chunk.done) {
        finishReason = chunk.done_reason === 'length' ? 'length' : 'stop';
        continue;
      }
      writeStreamChunk(response, model, chunk.message?.content || '', chunk.message?.tool_calls);
    }
  }

  response.write(
    `data: ${JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    })}\n\n`
  );
  response.write('data: [DONE]\n\n');
  response.end();
}

export async function startCommandEveOllamaOpenAiShim(shimOptions: CommandEveOllamaShimOptions = {}): Promise<string> {
  if (server?.listening) return serverUrl || `http://127.0.0.1:${DEFAULT_SHIM_PORT}`;
  const options: Required<CommandEveOllamaShimOptions> = {
    port: shimOptions.port ?? DEFAULT_SHIM_PORT,
    ollamaBaseUrl: shimOptions.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL,
    numCtx: shimOptions.numCtx || DEFAULT_NUM_CTX,
    maxTokens: shimOptions.maxTokens || DEFAULT_MAX_TOKENS,
    promptProofPath: shimOptions.promptProofPath || '',
    egressReceiptPath: shimOptions.egressReceiptPath || '',
    egressPolicyAction: shimOptions.egressPolicyAction || 'block',
  };
  server = http.createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`).pathname;
      if (request.method === 'GET' && path === '/health') {
        jsonResponse(response, 200, { ok: true, upstream: options.ollamaBaseUrl });
        return;
      }
      if (request.method === 'GET' && path === '/v1/models') {
        await handleModels(response, options);
        return;
      }
      if (request.method === 'POST' && path === '/v1/chat/completions') {
        await handleChatCompletions(request, response, options);
        return;
      }
      jsonResponse(response, 404, { error: { message: `Unsupported Command EVE Ollama shim path: ${path}` } });
    })().catch((error) => {
      jsonResponse(response, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(options.port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = address && typeof address !== 'string' ? address.port : options.port;
  serverUrl = `http://127.0.0.1:${port}`;
  return serverUrl;
}

export async function stopCommandEveOllamaOpenAiShimForTest(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
  serverUrl = '';
}

export async function warmCommandEveLocalModel(
  warmupOptions: CommandEveModelWarmupOptions
): Promise<CommandEveModelWarmupResult> {
  const startedAt = Date.now();
  const baseUrl = warmupOptions.baseUrl || serverUrl || `http://127.0.0.1:${DEFAULT_SHIM_PORT}`;
  const maxTokens = warmupOptions.maxTokens ?? 1;
  if (!warmupOptions.model.trim()) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      model: warmupOptions.model,
      error: 'missing model',
    };
  }
  if (!isLoopbackHttpUrl(baseUrl)) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      model: warmupOptions.model,
      error: 'Command EVE model warm-up is local-only and requires a loopback URL.',
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), warmupOptions.timeoutMs ?? 60_000);
  try {
    const response = await fetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({
        model: warmupOptions.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: Math.max(1, Math.min(4, Math.floor(maxTokens))),
        stream: false,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        model: warmupOptions.model,
        error: text || `warm-up request failed (${response.status})`,
      };
    }
    await response.arrayBuffer().catch((): undefined => undefined);
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      model: warmupOptions.model,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      model: warmupOptions.model,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
