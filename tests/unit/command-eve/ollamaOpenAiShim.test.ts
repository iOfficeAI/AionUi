import http, { type IncomingMessage, type ServerResponse } from 'http';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCommandEvePromptProof,
  isCommandEveWarmupRequest,
  startCommandEveOllamaOpenAiShim,
  stopCommandEveOllamaOpenAiShimForTest,
  warmCommandEveLocalModel,
} from '@/process/commandEve/ollamaOpenAiShim';

let testServer: http.Server | undefined;
let shimServerUrl = '';

function readRequestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
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

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function startFakeOpenAiServer(onBody: (body: Record<string, unknown>, path: string) => void): Promise<string> {
  testServer = http.createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      const body = await readRequestBody(request);
      onBody(body, path);
      writeJson(response, 200, {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      });
    })().catch((error) => {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    testServer?.once('error', reject);
    testServer?.listen(0, '127.0.0.1', resolve);
  });

  const address = testServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('fake server did not expose a port');
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (testServer) {
    await new Promise<void>((resolve, reject) => {
      testServer?.close((error) => (error ? reject(error) : resolve()));
    });
    testServer = undefined;
  }
  if (!shimServerUrl) return;
  await stopCommandEveOllamaOpenAiShimForTest();
  shimServerUrl = '';
});

describe('Command EVE Ollama OpenAI shim warm-up', () => {
  it('detects EVE persona markers without storing prompt text', () => {
    const proof = buildCommandEvePromptProof({
      model: 'custom:command-eve-gemma4-e4b-64k:latest',
      messages: [
        {
          role: 'system',
          content: '# EVE Operating Rule\n\nYou are EVE, Command EVE Chief of Staff.',
        },
        { role: 'user', content: 'moin eve' },
      ],
    });

    expect(proof.ok).toBe(true);
    expect(proof.marker).toBe('eve_operating_rule');
    expect(proof.message_count).toBe(2);
    expect(proof.system_message_count).toBe(1);
    expect(proof.prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(proof)).not.toContain('moin eve');
  });

  it('classifies the startup ping as warm-up so it does not overwrite prompt proof', () => {
    expect(
      isCommandEveWarmupRequest({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      })
    ).toBe(true);
  });

  it('pre-warms the selected local model through the OpenAI-compatible chat endpoint', async () => {
    let seenBody: Record<string, unknown> | undefined;
    let seenPath = '';
    const baseUrl = await startFakeOpenAiServer((body, path) => {
      seenBody = body;
      seenPath = path;
    });

    const result = await warmCommandEveLocalModel({
      baseUrl,
      model: 'custom:command-eve-gemma4-e4b-64k:latest',
      timeoutMs: 5_000,
    });

    expect(result.ok).toBe(true);
    expect(result.model).toBe('custom:command-eve-gemma4-e4b-64k:latest');
    expect(seenPath).toBe('/v1/chat/completions');
    expect(seenBody?.model).toBe('custom:command-eve-gemma4-e4b-64k:latest');
    expect(seenBody?.stream).toBe(false);
    expect(seenBody?.max_tokens).toBe(1);
  });

  it('refuses to warm non-loopback providers', async () => {
    const result = await warmCommandEveLocalModel({
      baseUrl: 'https://api.example.com/v1',
      model: 'external-model',
      timeoutMs: 1_000,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('local-only');
  });

  it('blocks sensitive data before the fake Ollama upstream sees the request', async () => {
    let upstreamSeen = false;
    const baseUrl = await startFakeOpenAiServer((_body) => {
      upstreamSeen = true;
    });

    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl: baseUrl,
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'Hier ist ein API key: sk-abcdefghijklmnopqrstuvwxyz123456' }],
        stream: false,
      }),
    });
    const body = (await response.json()) as { error?: { receipt?: { decision?: string; raw_text_stored?: boolean } } };

    expect(response.status).toBe(451);
    expect(response.headers.get('x-command-eve-egress-decision')).toBe('block');
    expect(body.error?.receipt?.decision).toBe('block');
    expect(body.error?.receipt?.raw_text_stored).toBe(false);
    expect(upstreamSeen).toBe(false);
  });
});
