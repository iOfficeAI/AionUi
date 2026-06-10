/**
 * Builds the OpenCode `Hooks` object for the plugin and provides the
 * "latch" that disables the `chat.message` synthetic-part fallback as
 * soon as `experimental.chat.system.transform` fires at least once.
 *
 * The plugin must never throw out of a hook body — every hook is
 * wrapped in try/catch. The forwarding of audit events to AionCore is
 * fire-and-forget (no await) and any rejection is caught at the boundary.
 */

import type { Hooks, PluginInput, PluginOptions } from '@opencode-ai/plugin';

import { resolveConfig } from './config.js';
import { AionCoreClient, capPreview, TIMEOUTS } from './connection.js';
import type { ContextStore } from './context.js';
import { formatSystemInjection } from './context.js';
import { PLUGIN_VERSION } from './types.js';
import { createRunShellStreamingTool } from './shell.js';

/** Hook names that the plugin declares in the hello payload. */
export const DECLARED_HOOKS: readonly string[] = [
  'event',
  'tool.execute.before',
  'tool.execute.after',
  'permission.ask',
  'chat.message',
  'experimental.chat.system.transform',
] as const;

const FORWARDED_EVENT_TYPES: ReadonlySet<string> = new Set([
  'file.watcher.updated',
  'session.idle',
  'message.part.updated',
]);

/**
 * Best-effort: ask the OpenCode SDK client for the running server's
 * version. We probe a handful of methods defensively — none of them are
 * part of the documented PluginInput contract — and return `undefined`
 * on any failure.
 */
export const detectServerVersion = async (input: PluginInput): Promise<string | undefined> => {
  const candidate = input.client as unknown as Record<string, unknown>;
  const tryGet = (name: string): unknown => {
    const fn = candidate[name];
    return typeof fn === 'function' ? fn : undefined;
  };

  const probes: Array<() => Promise<unknown>> = [
    async () => {
      const app = tryGet('app') as { get?: (arg: string) => Promise<unknown> } | undefined;
      if (!app || typeof app.get !== 'function') return undefined;
      return app.get('version');
    },
    async () => {
      const app = tryGet('app') as { getVersion?: () => Promise<unknown> } | undefined;
      if (!app || typeof app.getVersion !== 'function') return undefined;
      return app.getVersion();
    },
  ];

  for (const probe of probes) {
    try {
      const value = await probe();
      if (typeof value === 'string' && value.length > 0) return value;
    } catch {
      // ignore — fall through to next probe
    }
  }
  return undefined;
};

export type BuildHooksInput = {
  client: AionCoreClient;
  store: ContextStore;
  opencodeVersion: string | undefined;
  project: { directory: string; worktree: string };
};

export type BuildHooksResult = {
  hooks: Hooks;
  /** Whether forwarding is enabled (i.e. config was resolvable). */
  enabled: boolean;
};

/** Build the hook bag for the OpenCode plugin runtime. */
export const buildHooks = (input: BuildHooksInput): BuildHooksResult => {
  const { client, store, opencodeVersion, project } = input;

  // Once `experimental.chat.system.transform` fires at least once, the
  // system prompt already carries our context, so the chat.message
  // fallback would double-inject. The latch disables it.
  let systemTransformFired = false;

  // Fire-and-forget helper. Catches and discards errors.
  const fireAndForget = (work: () => Promise<unknown>): void => {
    Promise.resolve()
      .then(work)
      .catch(() => {
        /* swallow — plugin must never crash the host */
      });
  };

  const hooks: Hooks = {
    event: async ({ event }) => {
      try {
        if (!event || typeof event !== 'object') return;
        const type = (event as { type?: string }).type;
        if (!type || !FORWARDED_EVENT_TYPES.has(type)) return;
        fireAndForget(() => client.sendResult({ kind: 'event', event }));
      } catch {
        /* swallow */
      }
    },

    'tool.execute.before': async (input2, output) => {
      try {
        fireAndForget(() =>
          client.sendResult({
            kind: 'toolBefore',
            tool: input2.tool,
            sessionId: input2.sessionID,
            callId: input2.callID,
            args: output.args,
          })
        );
      } catch {
        /* swallow */
      }
    },

    'tool.execute.after': async (input2, output) => {
      try {
        const preview = typeof output.output === 'string' ? capPreview(output.output) : undefined;
        const payload = {
          kind: 'toolAfter' as const,
          tool: input2.tool,
          sessionId: input2.sessionID,
          callId: input2.callID,
          args: input2.args,
          title: output.title,
          outputLen: typeof output.output === 'string' ? output.output.length : undefined,
          outputPreview: preview,
          metadata: output.metadata,
        };
        fireAndForget(() => client.sendResult(payload));
      } catch {
        /* swallow */
      }
    },

    'permission.ask': async (_input, output) => {
      try {
        const response = await client.sendResult(
          { kind: 'permissionAsk', permission: _input },
          { timeoutMs: TIMEOUTS.permission }
        );
        const status = (response as { status?: string }).status;
        if (status === 'allow' || status === 'deny' || status === 'ask') {
          output.status = status;
        }
        // On timeout / network error the sendResult throws and the catch
        // below leaves `output.status` untouched (native flow proceeds).
      } catch {
        /* swallow — output.status remains 'ask' */
      }
    },

    'experimental.chat.system.transform': async (input2, output) => {
      try {
        const additions = store.getSystem(input2.sessionID);
        if (additions.length > 0) {
          const block = formatSystemInjection(additions);
          if (block) output.system.push(block);
          systemTransformFired = true;
        }
      } catch {
        /* swallow */
      }
    },

    'chat.message': async (input2, output) => {
      try {
        if (systemTransformFired) return;
        const additions = store.getSystem(input2.sessionID);
        if (additions.length === 0) return;
        const text = formatSystemInjection(additions);
        if (!text) return;
        const sessionID = input2.sessionID;
        const messageID = output.message.id;
        output.parts.push({
          id: `chisl-ctx-${messageID}`,
          sessionID,
          messageID,
          type: 'text',
          text: `[AionCore context]\n${text}`,
          synthetic: true,
        });
      } catch {
        /* swallow */
      }
    },
  };

  return { hooks, enabled: true };
};

/** No-op hook bag used when the plugin is disabled (no URL/token). */
const buildDisabledHooks = (): Hooks => ({
  event: async () => {
    /* no-op */
  },
  'tool.execute.before': async () => {
    /* no-op */
  },
  'tool.execute.after': async () => {
    /* no-op */
  },
  'permission.ask': async () => {
    /* no-op */
  },
  'experimental.chat.system.transform': async () => {
    /* no-op */
  },
  'chat.message': async () => {
    /* no-op */
  },
});

/** Entry point for the plugin (matches `@opencode-ai/plugin`'s `Plugin`). */
export const createPlugin = async (input: PluginInput, options?: PluginOptions): Promise<Hooks> => {
  const mode = resolveConfig(options);
  if (mode.kind === 'disabled') {
    // Single console.warn at load. The host still receives a valid Hooks
    // bag so that the plugin doesn't break the runtime; every hook body
    // is a no-op.
    console.warn(`[chisl-opencode-plugin] ${mode.reason}`);
    return buildDisabledHooks();
  }

  const opencodeVersion = await detectServerVersion(input);
  const client = new AionCoreClient({ url: mode.config.url, token: mode.config.token });
  const project = { directory: input.directory, worktree: input.worktree };
  const store = (await import('./context.js')).ContextStore;

  // Hello body is built per reconnect from the declared hooks + project.
  const buildHello = (): import('./types.js').HelloRequest => {
    const body: import('./types.js').HelloRequest = {
      protocolVersion: 1,
      pluginVersion: PLUGIN_VERSION,
      hooks: [...DECLARED_HOOKS],
      project,
    };
    if (opencodeVersion) body.opencodeVersion = opencodeVersion;
    return body;
  };

  // Fire-and-forget background loop for the SSE stream.
  const { ContextStore: ContextStoreClass } = await import('./context.js');
  const storeInstance = new ContextStoreClass();
  const { connectEvents } = await import('./connection.js');
  const controller = new AbortController();
  void connectEvents({
    client,
    buildHello,
    dispatch: (event) => {
      if (event.type === 'context.update') {
        const data = event.data as { sessionID?: string; system?: string[]; note?: string } | undefined;
        if (data && Array.isArray(data.system)) {
          storeInstance.apply(data);
        }
        return;
      }
      if (event.type === 'ping' || event.type === 'raw') return;
    },
    signal: controller.signal,
  }).catch(() => {
    /* swallow */
  });

  const { hooks } = buildHooks({ client, store: storeInstance, opencodeVersion, project });

  // The streaming shell tool closes over the live client. A boxed
  // reference lets dispose() drop the reference and the factory read
  // the (now null) current value on the next call, putting the tool
  // into disabled mode.
  const clientRef: { current: AionCoreClient | null } = { current: client };
  const runShellStreamingTool = createRunShellStreamingTool(() => clientRef.current);

  // Annotate the returned object so dispose() can stop the SSE loop
  // and drop the client reference held by the shell tool.
  (hooks as { dispose?: () => Promise<void> }).dispose = async () => {
    controller.abort();
    clientRef.current = null;
  };

  return { ...hooks, tool: { run_shell_streaming: runShellStreamingTool } };
};
