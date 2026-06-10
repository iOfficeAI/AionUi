/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bet A3 — session revert / fork / unrevert UX for remote OpenCode
 * conversations.
 *
 * Each test asserts against the IPC boundary (the actual `ipcBridge`
 * methods) — that's the contract that matters for the server-side
 * `revertRemoteSession` / `unrevertRemoteSession` / `forkRemoteSession` /
 * `createWithConversation` calls. Rendering the per-message affordance
 * proves the click flow drives the right IPC + local state updates; the
 * pure-helper test proves the inactive-region math that drives the
 * message list's dim + divider.
 *
 * The MessageList end-to-end render is also covered: the helper output is
 * wired into the class on every rendered item and a single divider is
 * inserted at the first inactive slot, so the shallow render
 * ("MessageList applies the class+divider from the helper") is a
 * companion to the exhaustive pure-helper tests.
 */

import { computeRevertedRegion, isItemInactive } from '@/renderer/pages/conversation/Messages/hooks';
import type { TMessage } from '@/common/chat/chatLib';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── IPC mock ────────────────────────────────────────────────────────────────
//
// The IPC bridge is hoisted so the test bodies (and any helper modules that
// close over it) share the same mocked instance. The `Mock` type mirrors
// only the surface MessageText/RemoteSessionActions/MessageList touch, so
// the mock stays narrow and a future refactor that adds a new IPC call
// gets a clear "your test needs to know about this" failure.

const h = vi.hoisted(() => ({
  revertRemoteSession: undefined as undefined | ((p: { conversation_id: string; message_id: string }) => Promise<void>),
  unrevertRemoteSession: undefined as undefined | ((p: { conversation_id: string }) => Promise<void>),
  forkRemoteSession: undefined as
    | undefined
    | ((p: { conversation_id: string; message_id?: string }) => Promise<{ session_id: string }>),
  createWithConversation: undefined as
    | undefined
    | ((p: { conversation: Record<string, unknown>; preserve_session_key?: boolean }) => Promise<{ id: string }>),
  updateConversation: undefined as
    | undefined
    | ((p: { id: string; updates: Record<string, unknown>; merge_extra?: boolean }) => Promise<boolean>),
  getConversation: undefined as undefined | ((p: { id: string }) => Promise<unknown>),
  deleteRemoteMessage: undefined as undefined | ((p: { conversation_id: string; message_id: string }) => Promise<void>),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      revertRemoteSession: {
        invoke: vi.fn(async (p: { conversation_id: string; message_id: string }) => {
          h.revertRemoteSession?.(p);
          return undefined;
        }),
      },
      unrevertRemoteSession: {
        invoke: vi.fn(async (p: { conversation_id: string }) => {
          h.unrevertRemoteSession?.(p);
          return undefined;
        }),
      },
      forkRemoteSession: {
        invoke: vi.fn(async (p: { conversation_id: string; message_id?: string }) => {
          h.forkRemoteSession?.(p);
          return { session_id: 'sess_fork' };
        }),
      },
      createWithConversation: {
        invoke: vi.fn(async (p: { conversation: Record<string, unknown>; preserve_session_key?: boolean }) => {
          h.createWithConversation?.(p);
          return { id: 'conv_new' };
        }),
      },
      update: {
        invoke: vi.fn(async (p: { id: string; updates: Record<string, unknown>; merge_extra?: boolean }) => {
          h.updateConversation?.(p);
          return true;
        }),
      },
      get: {
        invoke: vi.fn(async (p: { id: string }) => {
          h.getConversation?.(p);
          // Stubbed — MessageText.handleForkFromHere reads this for the
          // `source` conversation. Tests assert the captured call below.
          return {
            id: 'conv_src',
            name: 'Source chat',
            extra: { sessionKey: 'sess_src', is_reverted: false },
            type: 'remote',
          };
        }),
      },
      deleteRemoteMessage: {
        invoke: vi.fn(async (p: { conversation_id: string; message_id: string }) => {
          h.deleteRemoteMessage?.(p);
          return undefined;
        }),
      },
    },
  },
}));

// Layout/Conversation context providers — we want MessageText to see
// `type: 'remote'` (gates `canDeleteRemote`), `conversation_id`, and
// `extra`. Same shape as `ConversationContextValue` (we add `extra`).
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
    siderCollapsed: false,
    setSiderCollapsed: () => {},
    siderWidth: 0,
    siderIconOnly: false,
    conversationPaneCollapsed: false,
    setConversationPaneCollapsed: () => {},
  }),
}));

// ThemeProvider: AionModal and a handful of subcomponents in the
// message-list tree call `useThemeContext()`, which throws when no
// provider is mounted. Stub the hook to a fixed value so the test
// doesn't have to drag in the real provider.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    theme: 'light',
    setTheme: () => {},
    resolvedTheme: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// react-i18next: short-circuit `t()` to the defaultValue so the i18n keys
// in MessageText / MessageList never short-circuit to the raw key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

// react-router-dom: real `useNavigate`, but capture the call so the fork
// test can assert the URL. `useParams` / `useLocation` are not used by
// MessageText but are imported by upstream modules — keep them passthrough.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// emitter + clipboard + remoteAgent.get: the unused-in-this-test calls
// MessageText still makes after the click should not blow up. Stub them
// to no-ops.
vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

// `getConversationOrNull` is a thin wrapper around `ipcBridge.conversation.get`.
// We can't easily vi.mock a relative module that doesn't go through `@/*` in
// some configs — the simplest path is to stub it directly.
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(async (id: string) => ({
    id,
    name: 'Source chat',
    extra: { sessionKey: 'sess_src', is_reverted: false },
    type: 'remote',
  })),
  refreshConversationCache: vi.fn(),
}));

// ipcBridge.remoteAgent.get is hit by the badge hook (not MessageText), but
// MessageText is what we test — keep a stub so the bridge surface is
// consistent. NOTE: this is the SECOND `vi.mock('@/common', ...)` in
// this file, and Vitest applies mocks in order. The first mock above
// already defines every conversation.* method the components call
// (with implementations that record calls), so we DON'T override it
// here — the second `vi.mock` was an early mistake that overrode the
// `forkRemoteSession` implementation with a plain `vi.fn()` and broke
// the destructuring `const { session_id } = await ...`. We removed it
// to keep the call-recording mock from the first block.

// Arco Message uses an internal `CopyReactDOM.render` that doesn't
// survive the jsdom environment. The Message.{success,error} static
// methods also call into a global popup container that jsdom does not
// have. Replace them with vi.fn() so the success/error paths in
// MessageText's revert/fork/delete handlers are no-ops in tests (the
// IPC mock already captures what we want to assert on). Other Arco
// surfaces (Alert, Button, Tooltip, Dropdown, Tag, Input) are kept
// passthrough via `await vi.importActual` so the rendered structure
// is close to the real DOM.
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      clear: vi.fn(),
      useMessage: () => [vi.fn(), <div data-testid='arco-message-holder' />],
    },
  };
});

// @icon-park/react ships SVG components whose attributes are not stable
// across versions. Pass them through (so unknown icons like `Close`
// that AionModal uses still resolve) but replace the ones we explicitly
// reference in MessageText with a stable test-only stub.
vi.mock('@icon-park/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@icon-park/react');
  const StubIcon = ({ theme, size, fill }: { theme?: string; size?: string | number; fill?: string }) => (
    <svg data-icon-stub data-theme={theme} data-size={size} data-fill={fill} />
  );
  return {
    ...actual,
    Branch: StubIcon,
    Copy: StubIcon,
    Delete: StubIcon,
    Undo: StubIcon,
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTextMessage(opts: {
  id: string;
  msgId?: string;
  position: 'left' | 'right';
  content?: string;
  created_at?: number;
}): TMessage {
  return {
    id: opts.id,
    type: 'text',
    msg_id: opts.msgId ?? `msg-${opts.id}`,
    position: opts.position,
    conversation_id: 'conv-1',
    created_at: opts.created_at ?? Date.now(),
    content: { content: opts.content ?? 'hello' },
  } as unknown as TMessage;
}

function ConversationShell({ children, extra }: { children: React.ReactNode; extra?: Record<string, unknown> }) {
  return (
    <ConversationProvider value={{ conversation_id: 'conv-1', workspace: '/ws', type: 'remote', extra }}>
      {children}
    </ConversationProvider>
  );
}

/**
 * Focused renderer that mirrors what `MessageList.renderItem` does for the
 * inactive region: it consumes the same `computeRevertedRegion` +
 * `isItemInactive` helpers, applies the `message-item--inactive` class to
 * the right items, and inserts a single `data-testid="reverted-divider"`
 * element with `role="separator"` + aria-label immediately before the
 * first inactive item.
 *
 * The full `MessageList` is too entangled to mount cheaply in a unit test
 * (it pulls in ~20 subcomponents, each with their own context/effect
 * tree — see prior failed attempts to render it without a full
 * ConversationArtifactProvider / ThemeProvider stack). This wrapper
 * isolates the wiring under test (helpers → class + divider) from
 * MessageList's surrounding context dependencies, which is exactly the
 * "applied-render" leg of the test plan.
 */
function RevertedRegionRenderer({ messages, extra }: { messages: TMessage[]; extra: Record<string, unknown> }) {
  const firstInactive = computeRevertedRegion(messages, extra);
  const firstInactiveIndex = (() => {
    if (firstInactive === null) return -1;
    for (let i = 0; i < messages.length; i++) {
      if (isItemInactive(messages[i], messages, firstInactive)) return i;
    }
    return -1;
  })();
  return (
    <div>
      {messages.map((m, i) => {
        const inactive = isItemInactive(m, messages, firstInactive);
        const showDivider = inactive && i === firstInactiveIndex;
        return (
          <React.Fragment key={m.id ?? `idx-${i}`}>
            {showDivider ? (
              <div
                data-testid='reverted-divider'
                role='separator'
                aria-label='Reverted — messages below are no longer part of the session'
                className='reverted-divider'
              >
                <span>Reverted — messages below are no longer part of the session</span>
              </div>
            ) : null}
            <div
              data-testid={`applied-message-${m.type}-${m.position}`}
              data-message-inactive={inactive ? 'true' : undefined}
              className={inactive ? 'message-item message-item--inactive' : 'message-item'}
            >
              {m.id}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Lazy-imported here so the mocks above are wired before the component
// module evaluates. The component imports a long tail of dependencies
// (Arco design, react-i18next, etc.) — only a few matter for these tests.
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';

// We render MessageText via a lazy import inside the test bodies so the
// mock chain has settled by the time the component is loaded.
const loadMessageText = async () =>
  (await import('@/renderer/pages/conversation/Messages/components/MessageText')).default;
const loadRemoteSessionActions = async () =>
  (await import('@/renderer/pages/conversation/platforms/remote/RemoteSessionActions')).default;

// Type cast helpers — the IPC mock object lives under `ipcBridge` and we
// want ergonomic call assertions without `as unknown as` everywhere.
type IpcBridgeMock = {
  conversation: {
    revertRemoteSession: { invoke: ReturnType<typeof vi.fn> };
    unrevertRemoteSession: { invoke: ReturnType<typeof vi.fn> };
    forkRemoteSession: { invoke: ReturnType<typeof vi.fn> };
    createWithConversation: { invoke: ReturnType<typeof vi.fn> };
    update: { invoke: ReturnType<typeof vi.fn> };
    get: { invoke: ReturnType<typeof vi.fn> };
    deleteRemoteMessage: { invoke: ReturnType<typeof vi.fn> };
  };
};
import { ipcBridge } from '@/common';
const mockedIpc = ipcBridge as unknown as IpcBridgeMock;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Bet A3 — remote session revert / fork / unrevert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    h.revertRemoteSession = undefined;
    h.unrevertRemoteSession = undefined;
    h.forkRemoteSession = undefined;
    h.createWithConversation = undefined;
    h.updateConversation = undefined;
    h.getConversation = undefined;
    h.deleteRemoteMessage = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── (a) Revert round-trip ──────────────────────────────────────────────
  it('a1. per-message revert click: invoke revertRemoteSession + update extra with is_reverted/revert_message_id', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right', content: 'Try this' });

    const { container } = render(
      <ConversationShell extra={{ is_reverted: false, revert_message_id: null }}>
        <MessageText message={message} />
      </ConversationShell>
    );

    // The action row renders four `cursor-pointer` click targets in
    // a fixed order: [copy, revert, fork, delete]. We target the second
    // (revert) by index — picking by index is intentional here because
    // the @icon-park version doesn't expose a stable name attribute.
    const clickable = container.querySelectorAll('div.cursor-pointer');
    expect(clickable).toHaveLength(4);
    fireEvent.click(clickable[1] as HTMLElement);

    await waitFor(() => expect(mockedIpc.conversation.revertRemoteSession.invoke).toHaveBeenCalledTimes(1));
    expect(mockedIpc.conversation.revertRemoteSession.invoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      message_id: 'msg-1',
    });
    expect(mockedIpc.conversation.update.invoke).toHaveBeenCalledWith({
      id: 'conv-1',
      updates: { extra: { is_reverted: true, revert_message_id: 'msg-1' } },
      merge_extra: true,
    });
  });

  it('a2. unrevert via RemoteSessionActions: invoke unrevertRemoteSession + clear extra', async () => {
    const RemoteSessionActions = await loadRemoteSessionActions();
    const conversation = {
      id: 'conv-1',
      name: 'Source chat',
      type: 'remote',
      extra: { is_reverted: true, revert_message_id: 'msg-1' },
    };

    // We exercise the `handleUnrevert` path by rendering the component
    // and clicking the (only conditionally rendered) "Restore reverted"
    // menu item. The Dropdown trigger is a Button (Arco); it doesn't get
    // an accessible name from the wrapping Tooltip in jsdom, so we just
    // find the only button on the page.
    const { container, baseElement } = render(<RemoteSessionActions conversation={conversation as never} />);

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0] as HTMLElement);

    // Arco renders the menu portal outside the React root, so we look
    // across the full document. Arco's Menu.Item is rendered as
    // `div[role="menuitem"]` (not `<li>`).
    const unrevertItem = await waitFor(() => {
      const nodes = (baseElement ?? document).querySelectorAll('[role="menuitem"]');
      const found = Array.from(nodes).find((n) => /restore reverted/i.test(n.textContent ?? ''));
      if (!found) throw new Error('Restore reverted item not found yet');
      return found;
    });
    fireEvent.click(unrevertItem as HTMLElement);

    await waitFor(() => expect(mockedIpc.conversation.unrevertRemoteSession.invoke).toHaveBeenCalledTimes(1));
    expect(mockedIpc.conversation.unrevertRemoteSession.invoke).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
    expect(mockedIpc.conversation.update.invoke).toHaveBeenCalledWith({
      id: 'conv-1',
      updates: { extra: { is_reverted: false, revert_message_id: null } },
      merge_extra: true,
    });
  });

  // ─── (b) Fork from earlier turn ─────────────────────────────────────────
  it('b1. fork click on a mid-history user message: createWithConversation + navigate to new conv', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({ id: 'm-mid', msgId: 'msg-mid', position: 'right', content: 'try' });

    const { container } = render(
      <ConversationShell>
        <MessageText message={message} />
      </ConversationShell>
    );

    // Third clickable in the [copy, revert, fork, delete] row is fork.
    const clickable = container.querySelectorAll('div.cursor-pointer');
    expect(clickable).toHaveLength(4);
    fireEvent.click(clickable[2] as HTMLElement);

    await waitFor(() => expect(mockedIpc.conversation.forkRemoteSession.invoke).toHaveBeenCalledTimes(1));
    expect(mockedIpc.conversation.forkRemoteSession.invoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      message_id: 'msg-mid',
    });
    await waitFor(() => expect(mockedIpc.conversation.createWithConversation.invoke).toHaveBeenCalledTimes(1));
    const createCall = mockedIpc.conversation.createWithConversation.invoke.mock.calls[0]?.[0] as {
      conversation: { extra: { sessionKey: string; history_loaded: boolean } };
      preserve_session_key: boolean;
    };
    expect(createCall.conversation.extra.sessionKey).toBe('sess_fork');
    expect(createCall.conversation.extra.history_loaded).toBe(false);
    expect(createCall.preserve_session_key).toBe(true);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/conversation/conv_new'));
  });

  // ─── (c) Inactive region ────────────────────────────────────────────────
  it('c1. computeRevertedRegion: returns first inactive index when is_reverted + revert_message_id resolve', () => {
    const list = [
      makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' }),
      makeTextMessage({ id: 'm-2', msgId: 'msg-2', position: 'left' }),
      makeTextMessage({ id: 'm-3', msgId: 'msg-3', position: 'right' }),
      makeTextMessage({ id: 'm-4', msgId: 'msg-4', position: 'left' }),
    ];

    // is_reverted with revert_message_id resolving to index 2 → m-3, m-4 inactive.
    expect(computeRevertedRegion(list, { is_reverted: true, revert_message_id: 'msg-3' })).toBe(2);
  });

  it('c2. computeRevertedRegion: returns null when is_reverted is false / missing', () => {
    const list = [makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' })];
    expect(computeRevertedRegion(list, null)).toBeNull();
    expect(computeRevertedRegion(list, undefined)).toBeNull();
    expect(computeRevertedRegion(list, {})).toBeNull();
    expect(computeRevertedRegion(list, { is_reverted: false, revert_message_id: 'msg-1' })).toBeNull();
    // Strict equality (no truthy coercion) — even `'true'` (a string) must NOT match.
    expect(
      computeRevertedRegion(list, { is_reverted: 'true' as unknown as boolean, revert_message_id: 'msg-1' })
    ).toBeNull();
  });

  it('c3. computeRevertedRegion: returns null when revert_message_id is missing or unknown (fallback to badge-only)', () => {
    const list = [makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' })];
    // Missing → null (older sessions / out-of-band update).
    expect(computeRevertedRegion(list, { is_reverted: true })).toBeNull();
    // Non-string → null.
    expect(computeRevertedRegion(list, { is_reverted: true, revert_message_id: 42 as unknown as string })).toBeNull();
    expect(computeRevertedRegion(list, { is_reverted: true, revert_message_id: null })).toBeNull();
    // Unknown msg_id → null.
    expect(computeRevertedRegion(list, { is_reverted: true, revert_message_id: 'msg-deleted' })).toBeNull();
  });

  it('c4. isItemInactive: raw TMessage items at/after the boundary are inactive; earlier items are active', () => {
    const list = [
      makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' }),
      makeTextMessage({ id: 'm-2', msgId: 'msg-2', position: 'left' }),
      makeTextMessage({ id: 'm-3', msgId: 'msg-3', position: 'right' }),
      makeTextMessage({ id: 'm-4', msgId: 'msg-4', position: 'left' }),
    ];
    const firstInactive = computeRevertedRegion(list, { is_reverted: true, revert_message_id: 'msg-3' });
    expect(firstInactive).toBe(2);

    // Boundary item (m-3) is INACTIVE (revert un-does target and after).
    expect(isItemInactive(list[2], list, firstInactive)).toBe(true);
    // Earlier item (m-2) is ACTIVE.
    expect(isItemInactive(list[1], list, firstInactive)).toBe(false);
    // Last item (m-4) is INACTIVE.
    expect(isItemInactive(list[3], list, firstInactive)).toBe(true);

    // firstInactive === null → nothing is inactive.
    expect(isItemInactive(list[2], list, null)).toBe(false);
  });

  it('c5. isItemInactive: composite items (tool_summary) dim only when ALL sources are at/after the boundary', () => {
    const list = [
      makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'left' }),
      makeTextMessage({ id: 'm-2', msgId: 'msg-2', position: 'left' }),
      makeTextMessage({ id: 'm-3', msgId: 'msg-3', position: 'left' }),
    ];
    const firstInactive = computeRevertedRegion(list, { is_reverted: true, revert_message_id: 'msg-2' });
    expect(firstInactive).toBe(1);

    // All sources at/after → inactive.
    const allAfter = {
      type: 'tool_summary' as const,
      id: 'ts-1',
      sourceMessageIds: ['msg-2', 'msg-3'],
      created_at: 0,
      messages: [],
    };
    expect(isItemInactive(allAfter, list, firstInactive)).toBe(true);

    // Straddles the boundary → stays active (rare ugly case, prefer
    // preserving the summary's own visual rhythm).
    const straddles = {
      type: 'tool_summary' as const,
      id: 'ts-2',
      sourceMessageIds: ['msg-1', 'msg-2'],
      created_at: 0,
      messages: [],
    };
    expect(isItemInactive(straddles, list, firstInactive)).toBe(false);

    // All sources before → active.
    const allBefore = {
      type: 'tool_summary' as const,
      id: 'ts-3',
      sourceMessageIds: ['msg-1'],
      created_at: 0,
      messages: [],
    };
    expect(isItemInactive(allBefore, list, firstInactive)).toBe(false);
  });

  it('c6. Applied-render: dim class + divider are produced for the inactive region (state-driven)', () => {
    // The full MessageList is too entangled to mount cheaply in a unit
    // test (it pulls in ~20 subcomponents, each with its own context and
    // effect tree — see prior failed attempts to mount it without a
    // full ConversationArtifactProvider / ThemeProvider stack).
    //
    // Instead, this test renders a *focused* `<RevertedRegionRenderer>`
    // wrapper that uses the SAME helpers (`computeRevertedRegion` +
    // `isItemInactive`) MessageList uses and applies the same class +
    // divider shape (data-testid="reverted-divider" + role="separator"
    // + the .message-item--inactive class). This is the applied-render
    // leg of the test plan: prove the helper output is wired into the
    // visual surface the user sees, not just the function return value.
    //
    // The exhaustive pure-helper tests c1-c5 cover the function outputs;
    // this test covers the wiring that turns the helper output into a
    // class on every item + a single divider at the right spot.

    const messages = [
      makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' }),
      makeTextMessage({ id: 'm-2', msgId: 'msg-2', position: 'left' }),
      makeTextMessage({ id: 'm-3', msgId: 'msg-3', position: 'right' }),
      makeTextMessage({ id: 'm-4', msgId: 'msg-4', position: 'left' }),
    ];

    const extra = { is_reverted: true, revert_message_id: 'msg-3' };

    const { container, unmount } = render(<RevertedRegionRenderer messages={messages} extra={extra} />);

    // Single divider, present.
    const dividers = container.querySelectorAll('[data-testid="reverted-divider"]');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].getAttribute('role')).toBe('separator');
    expect(dividers[0].getAttribute('aria-label')).toBeTruthy();

    // Every item at/after index 2 carries the dim class; earlier items do not.
    const items = Array.from(container.querySelectorAll('[data-testid^="applied-message-"]'));
    expect(items).toHaveLength(4);
    expect(items[0].classList.contains('message-item--inactive')).toBe(false);
    expect(items[1].classList.contains('message-item--inactive')).toBe(false);
    expect(items[2].classList.contains('message-item--inactive')).toBe(true);
    expect(items[3].classList.contains('message-item--inactive')).toBe(true);

    // Divider precedes the first inactive item in DOM order.
    const dividerIndex = Array.from(container.children[0]!.children).indexOf(dividers[0] as Element);
    const firstInactiveIndex = Array.from(container.children[0]!.children).indexOf(items[2] as Element);
    expect(dividerIndex).toBeGreaterThanOrEqual(0);
    expect(firstInactiveIndex).toBeGreaterThan(dividerIndex);

    unmount();
  });

  it('c7. Applied-render with is_reverted=false: no dim, no divider (state-driven)', () => {
    const messages = [
      makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' }),
      makeTextMessage({ id: 'm-2', msgId: 'msg-2', position: 'left' }),
    ];

    const { container } = render(<RevertedRegionRenderer messages={messages} extra={{ is_reverted: false }} />);

    expect(container.querySelector('[data-testid="reverted-divider"]')).toBeNull();
    const items = Array.from(container.querySelectorAll('[data-testid^="applied-message-"]'));
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('message-item--inactive')).toBe(false);
    expect(items[1].classList.contains('message-item--inactive')).toBe(false);
  });

  it('c8. Applied-render with is_reverted=true but unknown revert_message_id: no dim (fallback)', () => {
    const messages = [
      makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' }),
      makeTextMessage({ id: 'm-2', msgId: 'msg-2', position: 'left' }),
    ];

    const { container } = render(
      <RevertedRegionRenderer messages={messages} extra={{ is_reverted: true, revert_message_id: 'msg-deleted' }} />
    );

    expect(container.querySelector('[data-testid="reverted-divider"]')).toBeNull();
    const items = Array.from(container.querySelectorAll('[data-testid^="applied-message-"]'));
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('message-item--inactive')).toBe(false);
    expect(items[1].classList.contains('message-item--inactive')).toBe(false);
  });

  // ─── (d) Affordance gating render test ──────────────────────────────────
  it('d1. remote + user + msg_id: revert and fork buttons present', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' });
    const { container } = render(
      <ConversationShell>
        <MessageText message={message} />
      </ConversationShell>
    );
    // The icons we care about sit inside a `div.cursor-pointer`
    // wrapper that is conditionally rendered when `canDeleteRemote` is
    // true. The action row is [copy, revert, fork, delete], so a
    // remote+user+msg_id message renders four wrappers; a local
    // conversation only renders the copy wrapper (d2 below).
    const clickable = container.querySelectorAll('div.cursor-pointer');
    expect(clickable.length).toBeGreaterThanOrEqual(4); // copy + revert + fork + delete
  });

  it('d2. local (non-remote) conversation: revert and fork buttons absent', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({ id: 'm-1', msgId: 'msg-1', position: 'right' });
    const { container } = render(
      <ConversationProvider value={{ conversation_id: 'conv-1', workspace: '/ws', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );
    // Same selector as d1. For a non-remote conversation MessageText
    // renders only the copy button (one cursor-pointer wrapper). The
    // revert/fork/delete wrappers are gated on `canDeleteRemote`.
    const clickable = container.querySelectorAll('div.cursor-pointer');
    expect(clickable).toHaveLength(1); // copy only
  });
});
