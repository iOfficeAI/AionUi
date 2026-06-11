/**
 * VoiceModeStore semantics + SSE dispatch routing + buildHooks
 * integration (SPOKEN_INSTRUCTION injection, latch behavior, "voice
 * off is byte-identical to v0.1.0").
 */
import { describe, it, expect, vi } from 'vitest';
import { VoiceModeStore, SPOKEN_INSTRUCTION } from '../../../packages/opencode-plugin/src/voice.js';
import { buildHooks } from '../../../packages/opencode-plugin/src/capabilities.js';
import { ContextStore } from '../../../packages/opencode-plugin/src/context.js';
import { AionCoreClient, parseSseStream } from '../../../packages/opencode-plugin/src/connection.js';
import { installFetchMock, okHello, sseResponse, okResult } from './_helpers.js';

const collect = async (chunks: string[]): Promise<unknown[]> => {
  const events: unknown[] = [];
  const ac = new AbortController();
  await parseSseStream(sseResponse(chunks).body as ReadableStream<Uint8Array>, (ev) => events.push(ev), ac.signal);
  return events;
};

const makeClient = (): AionCoreClient => new AionCoreClient({ url: 'https://a.example.com', token: 't' });

describe('VoiceModeStore', () => {
  it('is disabled globally by default', () => {
    const store = new VoiceModeStore();
    expect(store.isEnabled(undefined)).toBe(false);
    expect(store.isEnabled('ses_x')).toBe(false);
  });

  it('apply with no sessionID toggles the global default', () => {
    const store = new VoiceModeStore();
    store.apply({ sessionID: undefined, enabled: true });
    expect(store.isEnabled(undefined)).toBe(true);
    expect(store.isEnabled('ses_x')).toBe(true);
    store.apply({ sessionID: null, enabled: false });
    expect(store.isEnabled(undefined)).toBe(false);
    expect(store.isEnabled('ses_x')).toBe(false);
  });

  it('per-session override takes precedence over the global default', () => {
    const store = new VoiceModeStore();
    store.apply({ enabled: true }); // global on
    expect(store.isEnabled('ses_a')).toBe(true);
    store.apply({ sessionID: 'ses_a', enabled: false });
    expect(store.isEnabled('ses_a')).toBe(false);
    // Other sessions still see global
    expect(store.isEnabled('ses_b')).toBe(true);
  });

  it('evicts the oldest per-session override when the cap is exceeded', () => {
    const store = new VoiceModeStore({ maxSessions: 2 });
    store.apply({ sessionID: 'a', enabled: true });
    store.apply({ sessionID: 'b', enabled: true });
    store.apply({ sessionID: 'c', enabled: true });
    // 'a' is the oldest entry and is evicted from the per-session map.
    // With the global default still false, an evicted session falls
    // back to the global value.
    expect(store.isEnabled('a')).toBe(false);
    // 'b' and 'c' are still in the per-session map.
    expect(store.isEnabled('b')).toBe(true);
    expect(store.isEnabled('c')).toBe(true);
    // And the internal map confirms 'a' is gone.
    expect(store.snapshot().perSession.has('a')).toBe(false);
  });

  it('snapshot returns a defensive copy of per-session overrides', () => {
    const store = new VoiceModeStore();
    store.apply({ sessionID: 'ses_x', enabled: true });
    const snap = store.snapshot();
    expect(snap.global).toBe(false);
    expect(snap.perSession.get('ses_x')).toBe(true);
    // Mutating the snapshot does not affect the store
    snap.perSession.set('ses_x', false);
    expect(store.isEnabled('ses_x')).toBe(true);
  });

  it('clear() resets all state', () => {
    const store = new VoiceModeStore();
    store.apply({ enabled: true });
    store.apply({ sessionID: 'ses_x', enabled: true });
    store.clear();
    expect(store.isEnabled(undefined)).toBe(false);
    expect(store.isEnabled('ses_x')).toBe(false);
  });
});

describe('SPOKEN_INSTRUCTION', () => {
  it('is a non-empty string mentioning "spoken" + voice / TTS', () => {
    expect(typeof SPOKEN_INSTRUCTION).toBe('string');
    expect(SPOKEN_INSTRUCTION.length).toBeGreaterThan(0);
    expect(SPOKEN_INSTRUCTION).toMatch(/spoken/i);
    expect(SPOKEN_INSTRUCTION).toMatch(/voice/i);
  });
});

describe('parseSseStream — voice_mode dispatch', () => {
  it('dispatches a typed voice_mode event with parsed JSON data', async () => {
    const payload = JSON.stringify({ type: 'voice_mode', data: { sessionID: 'ses_x', enabled: true } });
    const events = await collect([`event: voice_mode\ndata: ${payload}\n\n`]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'voice_mode', data: { sessionID: 'ses_x', enabled: true } });
  });

  it('dispatches voice_mode even when the event line is missing (JSON in data)', async () => {
    const payload = JSON.stringify({ type: 'voice_mode', data: { enabled: false } });
    const events = await collect([`data: ${payload}\n\n`]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'voice_mode', data: { enabled: false } });
  });
});

describe('createPlugin SSE integration: voice_mode updates the voice store', () => {
  it('routes a voice_mode SSE message to the per-session override', async () => {
    vi.useRealTimers();
    // Empty SSE response that closes after the body. We send our voice
    // event into the SAME body via chunks; the parser dispatches
    // before the stream ends.
    const voiceChunk = `event: voice_mode\ndata: ${JSON.stringify({
      type: 'voice_mode',
      data: { sessionID: 'ses_x', enabled: true },
    })}\n\n`;
    const closeChunk = '';
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(voiceChunk));
        c.enqueue(encoder.encode(closeChunk));
        c.close();
      },
    });
    const sseResp = new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });

    installFetchMock([okHello(), sseResp, okResult()]);
    const { ChislPlugin } = await import('../../../packages/opencode-plugin/src/index.js');
    const input = {
      client: {} as never,
      project: { id: 'p1', worktree: '/wt', time: { created: 0 } },
      directory: '/proj',
      worktree: '/wt',
      experimental_workspace: { register: () => undefined },
      serverUrl: new URL('http://localhost:3000'),
      $: {} as never,
    };
    const hooks = await ChislPlugin(input, { url: 'https://a.example.com', token: 't' });

    // Wait for the SSE dispatch to land
    await new Promise((r) => setTimeout(r, 30));

    // No public accessor for the internal store; instead, verify
    // observable behavior: with voice on, system.transform pushes
    // SPOKEN_INSTRUCTION for the matching session.
    const out = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 'ses_x', model: {} as never }, out);
    expect(out.system).toContain(SPOKEN_INSTRUCTION);

    // And for a different session, voice should be off (global default false).
    const out2 = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 'other', model: {} as never }, out2);
    expect(out2.system).not.toContain(SPOKEN_INSTRUCTION);

    await hooks.dispose?.();
  });
});

describe('buildHooks: voice-mode integration', () => {
  it('does NOT push SPOKEN_INSTRUCTION when voice store is absent (byte-identical to v0.1.0)', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['ctx'] });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, out);
    expect(out.system).toEqual(['ctx']);
    expect(out.system).not.toContain(SPOKEN_INSTRUCTION);
  });

  it('does NOT push SPOKEN_INSTRUCTION when voice store is present but voice is OFF', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['ctx'] });
    const voice = new VoiceModeStore(); // default off
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
      voiceStore: voice,
    });
    const out = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, out);
    expect(out.system).toEqual(['ctx']);
    expect(out.system).not.toContain(SPOKEN_INSTRUCTION);
  });

  it('pushes SPOKEN_INSTRUCTION into system when voice is ON for the session', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['ctx'] });
    const voice = new VoiceModeStore();
    voice.apply({ sessionID: 's1', enabled: true });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
      voiceStore: voice,
    });
    const out = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, out);
    expect(out.system).toContain('ctx');
    expect(out.system).toContain(SPOKEN_INSTRUCTION);
  });

  it('pushes SPOKEN_INSTRUCTION into system even when there is no context (voice-only)', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore(); // empty
    const voice = new VoiceModeStore();
    voice.apply({ sessionID: 's1', enabled: true });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
      voiceStore: voice,
    });
    const out = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, out);
    expect(out.system).toEqual([SPOKEN_INSTRUCTION]);
  });

  it('chat.message fallback is byte-identical to v0.1.0 when voice is off (no voice store)', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['shared-context'] });
    store.apply({ sessionID: 's1', system: ['session-context'] });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { message: { id: 'm1' }, parts: [] as unknown[] };
    await hooks['chat.message']!({ sessionID: 's1' }, out as never);
    expect(out.parts).toHaveLength(1);
    const part = out.parts[0] as { type: string; text: string };
    expect(part.type).toBe('text');
    expect(part.text).toBe('[AionCore context]\nshared-context\n\nsession-context');
    expect(part.text).not.toContain(SPOKEN_INSTRUCTION);
  });

  it('chat.message fallback includes SPOKEN_INSTRUCTION when voice is on and latch is unfired', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['ctx'] });
    const voice = new VoiceModeStore();
    voice.apply({ sessionID: 's1', enabled: true });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
      voiceStore: voice,
    });
    const out = { message: { id: 'm1' }, parts: [] as unknown[] };
    await hooks['chat.message']!({ sessionID: 's1' }, out as never);
    expect(out.parts).toHaveLength(1);
    const part = out.parts[0] as { type: string; text: string };
    expect(part.text).toContain('ctx');
    expect(part.text).toContain(SPOKEN_INSTRUCTION);
  });

  it('chat.message latch: when system.transform already fired (with voice off), no synthetic part is pushed', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['ctx'] });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const sysOut = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, sysOut);
    expect(sysOut.system).toHaveLength(1);
    const chatOut = { message: { id: 'm1' }, parts: [] as unknown[] };
    await hooks['chat.message']!({ sessionID: 's1' }, chatOut as never);
    expect(chatOut.parts).toHaveLength(0);
  });

  it('chat.message latch: when system.transform already fired (with voice on), the latch still suppresses the fallback (system prompt already carries the instruction)', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['ctx'] });
    const voice = new VoiceModeStore();
    voice.apply({ sessionID: 's1', enabled: true });
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
      voiceStore: voice,
    });
    const sysOut = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, sysOut);
    expect(sysOut.system).toContain(SPOKEN_INSTRUCTION);
    const chatOut = { message: { id: 'm1' }, parts: [] as unknown[] };
    await hooks['chat.message']!({ sessionID: 's1' }, chatOut as never);
    expect(chatOut.parts).toHaveLength(0);
  });
});

// Use okResult to keep installFetchMock imports warm
void okResult;
