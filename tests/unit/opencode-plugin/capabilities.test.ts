/**
 * Audit forwarding: tool.execute.before/after produce correct POST
 * bodies; output preview is capped. permission.ask applies the
 * returned status; network failure leaves output.status untouched.
 */
import { describe, it, expect, vi } from 'vitest';
import { AionCoreClient, OUTPUT_PREVIEW_MAX } from '../../../packages/opencode-plugin/src/connection.js';
import { buildHooks } from '../../../packages/opencode-plugin/src/capabilities.js';
import { ContextStore } from '../../../packages/opencode-plugin/src/context.js';
import { installFetchMock, okResult, permissionResult } from './_helpers.js';
import type { FetchCall } from './_helpers.js';

const pluginResultCalls = (calls: FetchCall[]): Array<{ body: unknown; url: string }> =>
  calls
    .filter((c) => c.url.endsWith('/plugin/result'))
    .map((c) => ({ url: c.url, body: JSON.parse(c.init.body as string) as unknown }));

const flushFireAndForget = async (): Promise<void> => {
  // Two microtask flushes are sufficient to let the fire-and-forget
  // Promise.resolve().then().catch() chain complete.
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
};

describe('audit forwarding: tool.execute.before/after', () => {
  it('forwards tool.execute.before with sessionId and callId', async () => {
    const { calls } = installFetchMock([() => okResult()]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { args: { foo: 'bar' } };
    await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'sess-1', callID: 'call-9' }, out);
    await flushFireAndForget();

    const result = pluginResultCalls(calls);
    expect(result).toHaveLength(1);
    expect(result[0]!.body).toEqual({
      kind: 'toolBefore',
      tool: 'read',
      sessionId: 'sess-1',
      callId: 'call-9',
      args: { foo: 'bar' },
    });
  });

  it('forwards tool.execute.after with output preview capped at 2048 chars', async () => {
    const { calls } = installFetchMock([() => okResult()]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const big = 'x'.repeat(OUTPUT_PREVIEW_MAX + 100);
    await hooks['tool.execute.after']!(
      { tool: 'write', sessionID: 's2', callID: 'c2', args: { path: '/a' } },
      { title: 'did-thing', output: big, metadata: { ok: true } }
    );
    await flushFireAndForget();

    const result = pluginResultCalls(calls);
    expect(result).toHaveLength(1);
    const body = result[0]!.body as { kind: string; outputLen?: number; outputPreview?: string };
    expect(body.kind).toBe('toolAfter');
    expect(body.outputLen).toBe(OUTPUT_PREVIEW_MAX + 100);
    expect(body.outputPreview).toBeDefined();
    expect(body.outputPreview!.length).toBeLessThanOrEqual(OUTPUT_PREVIEW_MAX + 64);
    expect(body.outputPreview!.startsWith('xxxx')).toBe(true);
  });

  it('records outputLen and preview even for short string output', async () => {
    const { calls } = installFetchMock([() => okResult()]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    await hooks['tool.execute.after']!(
      { tool: 'binary', sessionID: 's3', callID: 'c3', args: {} },
      { title: 'bin', output: 'ok', metadata: null }
    );
    await flushFireAndForget();
    const body = pluginResultCalls(calls)[0]!.body as { outputLen?: number; outputPreview?: string };
    expect(body.outputLen).toBe(2);
    expect(body.outputPreview).toBe('ok');
  });
});

describe('permission.ask: applies returned status / leaves untouched on network error', () => {
  it('applies the status returned by AionCore (allow)', async () => {
    installFetchMock([() => permissionResult('allow')]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { status: 'ask' as 'ask' | 'deny' | 'allow' };
    await hooks['permission.ask']!({ permission: 'bash', patterns: ['*'], metadata: {} } as never, out);
    expect(out.status).toBe('allow');
  });

  it('applies the status returned by AionCore (deny)', async () => {
    installFetchMock([() => permissionResult('deny')]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { status: 'ask' as 'ask' | 'deny' | 'allow' };
    await hooks['permission.ask']!({ permission: 'edit', patterns: ['*.ts'], metadata: {} } as never, out);
    expect(out.status).toBe('deny');
  });

  it('leaves output.status untouched when the network call fails', async () => {
    // permission POST -> reject (simulate timeout / 5xx)
    installFetchMock([
      () => {
        throw new Error('network down');
      },
    ]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { status: 'ask' as 'ask' | 'deny' | 'allow' };
    await hooks['permission.ask']!({ permission: 'webfetch', patterns: ['*'], metadata: {} } as never, out);
    expect(out.status).toBe('ask'); // native flow proceeds
  });

  it('ignores an unknown status string from the server (defensive)', async () => {
    installFetchMock([
      () =>
        new Response(JSON.stringify({ ok: true, status: 'maybe' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ]);
    const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
    const { hooks } = buildHooks({
      client,
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });
    const out = { status: 'ask' as 'ask' | 'deny' | 'allow' };
    await hooks['permission.ask']!({ permission: 'bash', patterns: ['*'], metadata: {} } as never, out);
    expect(out.status).toBe('ask');
  });
});

describe('hook bodies never throw, even if forwarding rejects', () => {
  it('tool.execute.after swallows forwarding errors', async () => {
    // No mock -> fetch will reject in node
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no network');
      })
    );
    try {
      const client = new AionCoreClient({ url: 'https://a.example.com', token: 't' });
      const { hooks } = buildHooks({
        client,
        store: new ContextStore(),
        opencodeVersion: undefined,
        project: { directory: '/p', worktree: '/w' },
      });
      await expect(
        hooks['tool.execute.after']!(
          { tool: 't', sessionID: 's', callID: 'c', args: {} },
          { title: 'x', output: 'y', metadata: null }
        )
      ).resolves.toBeUndefined();
    } finally {
      vi.stubGlobal('fetch', realFetch);
    }
  });
});
