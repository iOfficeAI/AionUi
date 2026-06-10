/**
 * Context store: session-scoped + global system strings, latch disables
 * chat.message fallback after `experimental.chat.system.transform` fires.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextStore, formatSystemInjection } from '../../../packages/opencode-plugin/src/context.js';
import { buildHooks } from '../../../packages/opencode-plugin/src/capabilities.js';
import { AionCoreClient } from '../../../packages/opencode-plugin/src/connection.js';
import { installFetchMock, okHello, okResult } from './_helpers.js';

describe('ContextStore', () => {
  let store: ContextStore;
  beforeEach(() => {
    store = new ContextStore();
  });

  it('returns an empty system list when nothing has been applied', () => {
    expect(store.getSystem('s1')).toEqual([]);
    expect(store.snapshot('s1')).toEqual({ global: [], session: [] });
  });

  it('appends global strings that apply to every session', () => {
    store.apply({ system: ['G1', 'G2'] });
    expect(store.getSystem('any-session')).toEqual(['G1', 'G2']);
    expect(store.getSystem('another')).toEqual(['G1', 'G2']);
  });

  it('appends session-specific strings in order', () => {
    store.apply({ sessionID: 's1', system: ['A'] });
    store.apply({ sessionID: 's2', system: ['X'] });
    store.apply({ sessionID: 's1', system: ['B'] });
    expect(store.getSystem('s1')).toEqual(['A', 'B']);
    expect(store.getSystem('s2')).toEqual(['X']);
  });

  it('global + session are concatenated in order (global first)', () => {
    store.apply({ system: ['G'] });
    store.apply({ sessionID: 's1', system: ['S'] });
    expect(store.getSystem('s1')).toEqual(['G', 'S']);
  });

  it('ignores non-string entries in the system array', () => {
    store.apply({ system: ['good', 42, null, 'also-good'] as unknown as string[] });
    expect(store.getSystem('s')).toEqual(['good', 'also-good']);
  });

  it('evicts the oldest session entries when capacity is exceeded', () => {
    const small = new ContextStore({ maxSessions: 2 });
    small.apply({ sessionID: 'a', system: ['1'] });
    small.apply({ sessionID: 'b', system: ['2'] });
    small.apply({ sessionID: 'c', system: ['3'] });
    expect(small.getSystem('a')).toEqual([]);
    expect(small.getSystem('b')).toEqual(['2']);
    expect(small.getSystem('c')).toEqual(['3']);
  });
});

describe('formatSystemInjection', () => {
  it('returns empty for no strings', () => {
    expect(formatSystemInjection([])).toBe('');
  });
  it('joins strings with blank lines', () => {
    expect(formatSystemInjection(['a', 'b'])).toBe('a\n\nb');
  });
});

describe('buildHooks: system transform latch + chat.message fallback', () => {
  const makeClient = (): AionCoreClient => new AionCoreClient({ url: 'https://a.example.com', token: 't' });

  it('chat.message appends a synthetic TextPart when transform never fired', async () => {
    const { calls } = installFetchMock([() => okHello(), () => okResult()]);
    void calls;

    const store = new ContextStore();
    store.apply({ system: ['shared-context'] });
    store.apply({ sessionID: 's1', system: ['session-context'] });

    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });

    const out = {
      message: { id: 'm1' },
      parts: [] as unknown[],
    };
    await hooks['chat.message']!({ sessionID: 's1' }, out as never);

    expect(out.parts).toHaveLength(1);
    const part = out.parts[0] as {
      type: string;
      synthetic?: boolean;
      text?: string;
      sessionID?: string;
      messageID?: string;
    };
    expect(part.type).toBe('text');
    expect(part.synthetic).toBe(true);
    expect(part.text).toContain('shared-context');
    expect(part.text).toContain('session-context');
    expect(part.sessionID).toBe('s1');
    expect(part.messageID).toBe('m1');
  });

  it('does nothing when there is no context to inject', async () => {
    const { calls } = installFetchMock([() => okHello()]);
    void calls;
    const store = new ContextStore();
    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { message: { id: 'm1' }, parts: [] as unknown[] };
    await hooks['chat.message']!({ sessionID: 's1' }, out as never);
    expect(out.parts).toHaveLength(0);
  });

  it('latch: once system.transform fires, chat.message no longer appends', async () => {
    const { calls } = installFetchMock([() => okHello()]);
    void calls;
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
    expect(chatOut.parts).toHaveLength(0); // latch engaged
  });

  it('system.transform pushes context strings for the matching session only', async () => {
    const { calls } = installFetchMock([() => okHello()]);
    void calls;
    const store = new ContextStore();
    store.apply({ system: ['G'] });
    store.apply({ sessionID: 's1', system: ['A'] });
    store.apply({ sessionID: 's2', system: ['B'] });

    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });

    const out1 = { system: [] as string[] };
    const out2 = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!({ sessionID: 's1', model: {} as never }, out1);
    await hooks['experimental.chat.system.transform']!({ sessionID: 's2', model: {} as never }, out2);

    expect(out1.system).toEqual(['G\n\nA']);
    expect(out2.system).toEqual(['G\n\nB']);
  });
});
