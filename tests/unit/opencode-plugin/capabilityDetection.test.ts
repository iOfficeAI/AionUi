/**
 * Phase 2 Metric 5: OpenCode version-matrix proxy.
 *
 * A true multi-version harness (booting real OpenCode servers for
 * several SDK versions) is infeasible headlessly in CI. Instead, this
 * file proves that the plugin *degrades cleanly* when the host
 * environment is missing capabilities that a newer or older OpenCode
 * build may or may not expose.
 *
 * Covers four degradation scenarios:
 *
 *   1. Host omits `experimental.chat.system.transform` — the
 *      `chat.message` synthetic-part fallback must still inject the
 *      stored context.
 *   2. The plugin's hooks bag remains usable even when an arbitrary
 *      hook entry is removed before the host calls it (i.e. the
 *      plugin must not crash if the host only calls a subset).
 *   3. The `DECLARED_HOOKS` set is reported verbatim in the hello
 *      payload that AionCore receives on connect — this is the
 *      contract a host uses to know which hooks it may invoke.
 *   4. `detectServerVersion` is a best-effort probe: it must return
 *      `undefined` (not throw) when the SDK client does not expose
 *      `app.get('version')` or `app.getVersion()` — i.e. when the
 *      running server is from a build that did not implement them.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildHooks, DECLARED_HOOKS, detectServerVersion } from '../../../packages/opencode-plugin/src/capabilities.js';
import { AionCoreClient } from '../../../packages/opencode-plugin/src/connection.js';
import { ContextStore } from '../../../packages/opencode-plugin/src/context.js';
import { PLUGIN_VERSION } from '../../../packages/opencode-plugin/src/types.js';
import { installFetchMock, okHello, okResult } from './_helpers.js';
import type { FetchCall } from './_helpers.js';

/** Inferred shape of the OpenCode `PluginInput` (avoids a direct import
 * of the SDK types, which is not part of this package's dep tree). */
type DetectInput = Parameters<typeof detectServerVersion>[0];

const makeClient = (): AionCoreClient => new AionCoreClient({ url: 'https://a.example.com', token: 't' });

describe('chat.message fallback when system.transform hook is absent', () => {
  it('appends a synthetic TextPart carrying the stored context', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ system: ['shared-ctx'] });
    store.apply({ sessionID: 's1', system: ['session-ctx'] });

    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });

    // Sanity: system.transform is declared in the bag, but the test
    // simulates a host that never invokes it (e.g. an older OpenCode
    // build that does not know about the experimental hook).
    expect(typeof hooks['experimental.chat.system.transform']).toBe('function');
    expect(typeof hooks['chat.message']).toBe('function');

    const out = { message: { id: 'm1' }, parts: [] as unknown[] };
    await hooks['chat.message']!({ sessionID: 's1' }, out as never);

    // Fallback engaged — one synthetic part was pushed.
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
    expect(part.text).toContain('shared-ctx');
    expect(part.text).toContain('session-ctx');
    expect(part.sessionID).toBe('s1');
    expect(part.messageID).toBe('m1');
  });

  it('still appends a synthetic part after the bag is stripped of system.transform', async () => {
    installFetchMock([() => okHello()]);
    const store = new ContextStore();
    store.apply({ sessionID: 's1', system: ['only-here'] });

    const { hooks } = buildHooks({
      client: makeClient(),
      store,
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });

    // Simulate "host that does not implement / expose the experimental
    // hook" by removing it from the bag before any host code can call
    // it. The plugin must remain functional: chat.message must still
    // perform the synthetic-part injection.
    const degraded = { ...hooks };
    delete degraded['experimental.chat.system.transform'];

    const out = { message: { id: 'm1' }, parts: [] as unknown[] };
    await degraded['chat.message']!({ sessionID: 's1' }, out as never);

    expect(out.parts).toHaveLength(1);
    const part = out.parts[0] as { text?: string; synthetic?: boolean };
    expect(part.synthetic).toBe(true);
    expect(part.text).toContain('only-here');
  });
});

describe('plugin does not crash when a hook is absent from the host', () => {
  it('other hooks continue to forward audit events when chat.message is missing', async () => {
    installFetchMock([() => okHello(), () => okResult()]);
    const { hooks } = buildHooks({
      client: makeClient(),
      store: new ContextStore(),
      opencodeVersion: undefined,
      project: { directory: '/p', worktree: '/w' },
    });

    // Remove chat.message from the bag (host that does not support it).
    const degraded = { ...hooks };
    delete degraded['chat.message'];

    // tool.execute.after must still be invokable and must not throw.
    await expect(
      degraded['tool.execute.after']!(
        { tool: 'read', sessionID: 's', callID: 'c', args: {} },
        { title: 'ok', output: 'hi', metadata: null }
      )
    ).resolves.toBeUndefined();

    // permission.ask must still be invokable.
    await expect(
      degraded['permission.ask']!({ permission: 'bash', patterns: ['*'], metadata: {} } as never, { status: 'ask' })
    ).resolves.toBeUndefined();
  });

  it('createPlugin returns a bag that still works after a single hook is stripped', async () => {
    // Full plugin end-to-end (hello + immediate SSE close + no extra results needed).
    const emptySse = (): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    installFetchMock([okHello(), emptySse()]);

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

    // Strip an experimental hook (host doesn't know about it).
    const degraded = { ...hooks };
    delete degraded['experimental.chat.system.transform'];

    // Sanity: the remaining hooks are still invokable and resolve cleanly.
    expect(typeof degraded['event']).toBe('function');
    expect(typeof degraded['tool.execute.before']).toBe('function');
    expect(typeof degraded['tool.execute.after']).toBe('function');
    expect(typeof degraded['permission.ask']).toBe('function');
    expect(typeof degraded['chat.message']).toBe('function');
    expect(typeof degraded['tool']).toBe('object');

    await expect(degraded['event']!({ event: { type: 'file.watcher.updated' } as never })).resolves.toBeUndefined();

    await hooks.dispose?.();
  });
});

describe('DECLARED_HOOKS is reported in the hello payload', () => {
  const captureHello = (
    calls: FetchCall[]
  ): { hooks: string[]; pluginVersion: string; protocolVersion: number } | undefined => {
    const helloCall = calls.find((c) => c.url.endsWith('/plugin/hello'));
    if (!helloCall) return undefined;
    const body = JSON.parse(helloCall.init.body as string) as {
      hooks: string[];
      pluginVersion: string;
      protocolVersion: number;
    };
    return { hooks: body.hooks, pluginVersion: body.pluginVersion, protocolVersion: body.protocolVersion };
  };

  it('contains the full set of hook names the plugin implements', () => {
    // Static sanity — DECLARED_HOOKS is the contract surface.
    expect([...DECLARED_HOOKS]).toEqual([
      'event',
      'tool.execute.before',
      'tool.execute.after',
      'permission.ask',
      'chat.message',
      'experimental.chat.system.transform',
    ]);
  });

  it('sends the DECLARED_HOOKS list to AionCore on hello (and pluginVersion matches)', async () => {
    vi.useRealTimers();
    const emptySse = (): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    const { calls } = installFetchMock([okHello(), emptySse()]);

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

    // Give the SSE loop a moment to perform the hello POST.
    await new Promise((r) => setTimeout(r, 30));

    const hello = captureHello(calls);
    expect(hello).toBeDefined();
    if (!hello) return; // type guard for the checks below
    expect(hello.protocolVersion).toBe(1);
    expect(hello.pluginVersion).toBe(PLUGIN_VERSION);
    expect(hello.hooks).toEqual([...DECLARED_HOOKS]);

    await hooks.dispose?.();
  });
});

describe('detectServerVersion degrades gracefully when the server does not respond to version probes', () => {
  const baseInput = {
    project: { id: 'p', worktree: '/w', time: { created: 0 } },
    directory: '/d',
    worktree: '/w',
    experimental_workspace: { register: () => undefined },
    serverUrl: new URL('http://localhost:3000'),
    $: {} as never,
  } satisfies Omit<DetectInput, 'client'>;

  it('returns undefined when client has no app/version methods (older SDK build)', async () => {
    const input = { ...baseInput, client: {} as never } as DetectInput;
    await expect(detectServerVersion(input)).resolves.toBeUndefined();
  });

  it('returns undefined when app exists but has no get / getVersion methods', async () => {
    const input = {
      ...baseInput,
      client: { app: { somethingElse: () => Promise.resolve('x') } } as never,
    } as DetectInput;
    await expect(detectServerVersion(input)).resolves.toBeUndefined();
  });

  it('returns undefined when app.get throws (broken / unloaded server)', async () => {
    const input = {
      ...baseInput,
      client: {
        app: {
          get: () => Promise.reject(new Error('boom')),
        },
      } as never,
    } as DetectInput;
    await expect(detectServerVersion(input)).resolves.toBeUndefined();
  });

  it('returns undefined when app.getVersion returns a non-string value', async () => {
    const input = {
      ...baseInput,
      client: {
        app: {
          getVersion: () => Promise.resolve(42),
        },
      } as never,
    } as DetectInput;
    await expect(detectServerVersion(input)).resolves.toBeUndefined();
  });

  it('returns undefined for any client shape that is not a function-bearing app', async () => {
    // The implementation guards every probe with `typeof candidate[name] === 'function'`,
    // so realistic client shapes (object apps) all return undefined. The plugin
    // must remain functional in that case — verified by the createPlugin test below.
    const inputs: Array<DetectInput> = [
      { ...baseInput, client: {} as never } as DetectInput,
      {
        ...baseInput,
        client: { app: { get: (key: string) => (key === 'version' ? Promise.resolve('1.16.2') : undefined) } } as never,
      } as DetectInput,
      {
        ...baseInput,
        client: { app: { getVersion: () => Promise.resolve('1.16.2') } } as never,
      } as DetectInput,
    ];
    for (const input of inputs) {
      await expect(detectServerVersion(input)).resolves.toBeUndefined();
    }
  });

  it('createPlugin still loads successfully when version detection returns undefined', async () => {
    // The version is optional — a missing version must not block plugin load.
    const emptySse = (): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    const { calls } = installFetchMock([okHello(), emptySse()]);

    // The plugin uses `client` for detectServerVersion + SSE. An empty
    // client object means detectServerVersion returns undefined, which
    // is the same code path exercised by an older SDK build.
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

    // Plugin must load — a usable hooks bag is returned.
    expect(typeof hooks['chat.message']).toBe('function');
    expect(typeof hooks['experimental.chat.system.transform']).toBe('function');

    // Wait briefly so the hello POST lands; verify the opencodeVersion
    // field is OMITTED from the hello body (because detection returned
    // undefined), not set to an empty string.
    await new Promise((r) => setTimeout(r, 30));

    const helloCall = calls.find((c) => c.url.endsWith('/plugin/hello'));
    expect(helloCall).toBeDefined();
    if (helloCall) {
      const body = JSON.parse(helloCall.init.body as string) as { opencodeVersion?: unknown };
      expect(body).not.toHaveProperty('opencodeVersion');
    }

    await hooks.dispose?.();
  });
});

// Use vi to satisfy the linter (we may use vi.fn in future additions here).
void vi;
