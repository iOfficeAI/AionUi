import http, { type IncomingMessage, type ServerResponse } from 'http';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCommandEvePromptProof,
  buildEveCloudRoute,
  isCommandEveWarmupRequest,
  startCommandEveOllamaOpenAiShim,
  stopCommandEveOllamaOpenAiShimForTest,
  warmCommandEveLocalModel,
} from '@/process/commandEve/ollamaOpenAiShim';

/** Synthetic CEVE wire string — NOT a real license. */
const FAKE_LICENSE = 'CEVE.v2.FAKE-payload-TESTONLY.FAKE-sig-TESTONLY';

let eveFnServer: http.Server | undefined;

type EveFnSeen = { body?: Record<string, unknown>; authHeader?: string | null; path?: string };

/** A fake eve-inference function (returns an OpenAI-compatible completion). */
async function startFakeEveFunction(seen: EveFnSeen, opts?: { status?: number }): Promise<string> {
  eveFnServer = http.createServer((request, response) => {
    void (async () => {
      seen.path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      seen.authHeader = request.headers.authorization ?? null;
      seen.body = await readRequestBody(request);
      writeJson(response, opts?.status ?? 200, {
        choices: [{ message: { role: 'assistant', content: 'eve-cloud-ok' }, finish_reason: 'stop' }],
      });
    })().catch((error) => {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolve, reject) => {
    eveFnServer?.once('error', reject);
    eveFnServer?.listen(0, '127.0.0.1', resolve);
  });
  const address = eveFnServer.address();
  if (!address || typeof address === 'string') throw new Error('fake eve fn did not expose a port');
  // Loopback http is an allowed EVE function URL (same trust model as the
  // local-runtime loopback key), so the fake function is reachable in tests.
  return `http://127.0.0.1:${address.port}`;
}

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
  if (eveFnServer) {
    await new Promise<void>((resolve, reject) => {
      eveFnServer?.close((error) => (error ? reject(error) : resolve()));
    });
    eveFnServer = undefined;
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

describe('buildEveCloudRoute (pure)', () => {
  it('returns inactive for a local selection', () => {
    expect(buildEveCloudRoute({ isEveSelection: false })).toEqual({ active: false });
  });

  it('returns an active route carrying the function URL, license and tier for an EVE selection', () => {
    const route = buildEveCloudRoute({
      isEveSelection: true,
      tier: 'standard',
      functionUrl: 'https://example.test/functions/v1/eve-inference',
      license: FAKE_LICENSE,
    });
    expect(route.active).toBe(true);
    expect(route.functionUrl).toBe('https://example.test/functions/v1/eve-inference');
    expect(route.license).toBe(FAKE_LICENSE);
    expect(route.tier).toBe('standard');
  });
});

describe('Command EVE shim — EVE cloud routing', () => {
  it('routes an EVE-tier chat to the eve-inference function with bearer + tier, not to Ollama', async () => {
    let ollamaSeen = false;
    const ollamaBaseUrl = await startFakeOpenAiServer(() => {
      ollamaSeen = true;
    });
    const fnSeen: EveFnSeen = {};
    const fnUrl = await startFakeEveFunction(fnSeen);

    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl,
      eveRouting: () => ({ active: true, functionUrl: fnUrl, license: FAKE_LICENSE, tier: 'standard' }),
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'plan my week' }],
        stream: false,
      }),
    });
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };

    expect(response.status).toBe(200);
    expect(json.choices?.[0]?.message?.content).toBe('eve-cloud-ok');
    // The function — not Ollama — saw the request.
    expect(ollamaSeen).toBe(false);
    // The license rode ONLY in the Authorization header.
    expect(fnSeen.authHeader).toBe(`Bearer ${FAKE_LICENSE}`);
    // The tier is forwarded in the body; the local model ref is NOT smuggled.
    expect(fnSeen.body?.tier).toBe('standard');
    expect(fnSeen.body?.messages).toEqual([{ role: 'user', content: 'plan my week' }]);
    expect(fnSeen.body?.license).toBeUndefined();
    expect(fnSeen.body).not.toHaveProperty('model');
  });

  it('keeps a local-selection chat on Ollama (EVE route inactive)', async () => {
    let ollamaSeen = false;
    const ollamaBaseUrl = await startFakeOpenAiServer(() => {
      ollamaSeen = true;
    });
    const fnSeen: EveFnSeen = {};
    const fnUrl = await startFakeEveFunction(fnSeen);

    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl,
      eveRouting: () => buildEveCloudRoute({ isEveSelection: false }),
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'local hello' }],
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    expect(ollamaSeen).toBe(true);
    // The EVE function was never touched.
    expect(fnSeen.body).toBeUndefined();
  });

  it('blocks sensitive data on the EVE lane BEFORE the function is called', async () => {
    const fnSeen: EveFnSeen = {};
    const fnUrl = await startFakeEveFunction(fnSeen);

    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl: 'http://127.0.0.1:1', // never reached
      eveRouting: () => ({ active: true, functionUrl: fnUrl, license: FAKE_LICENSE, tier: 'standard' }),
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'API key: sk-abcdefghijklmnopqrstuvwxyz123456' }],
        stream: false,
      }),
    });

    expect(response.status).toBe(451);
    expect(response.headers.get('x-command-eve-egress-decision')).toBe('block');
    // The function never saw the secret.
    expect(fnSeen.body).toBeUndefined();
  });

  it('fail-closes with 401 when an EVE route is active but the license is missing', async () => {
    const fnSeen: EveFnSeen = {};
    const fnUrl = await startFakeEveFunction(fnSeen);

    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl: 'http://127.0.0.1:1',
      eveRouting: () => ({ active: true, functionUrl: fnUrl, license: '', tier: 'standard' }),
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      }),
    });

    expect(response.status).toBe(401);
    // No unauthenticated request was made.
    expect(fnSeen.body).toBeUndefined();
  });

  it('rejects a cleartext-remote function URL (fail closed, 500)', async () => {
    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl: 'http://127.0.0.1:1',
      eveRouting: () => ({
        active: true,
        functionUrl: 'http://evil.example.com/eve-inference',
        license: FAKE_LICENSE,
        tier: 'standard',
      }),
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      }),
    });

    expect(response.status).toBe(500);
  });

  it('keeps the warm-up ping on the local lane even when an EVE route is active', async () => {
    let ollamaSeen = false;
    const ollamaBaseUrl = await startFakeOpenAiServer(() => {
      ollamaSeen = true;
    });
    const fnSeen: EveFnSeen = {};
    const fnUrl = await startFakeEveFunction(fnSeen);

    shimServerUrl = await startCommandEveOllamaOpenAiShim({
      port: 0,
      ollamaBaseUrl,
      eveRouting: () => ({ active: true, functionUrl: fnUrl, license: FAKE_LICENSE, tier: 'standard' }),
    });

    const response = await fetch(`${shimServerUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'custom:command-eve-gemma4-e4b-64k:latest',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    // Warm-up exercises the bundled local model, never the cloud function.
    expect(ollamaSeen).toBe(true);
    expect(fnSeen.body).toBeUndefined();
  });
});
