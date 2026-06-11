/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bet B — voice-mode integration on `MessageText` and the sendbox voice
 * toggle. Two surfaces are under test:
 *
 *   1. `MessageText` renders a "spoken" row for an assistant message
 *      that contains a complete ` ```spoken ` block, hides the raw
 *      fence from the markdown, and (when voice mode is on + autoPlay
 *      is true) auto-enqueues the spoken text into the TTS queue.
 *   2. The voice-mode toggle button in the sendbox persists `voice_mode`
 *      on the conversation extra and pushes the state to the OpenCode
 *      plugin via `ipcBridge.remoteAgent.setVoiceMode.invoke`.
 *
 * We mock the IPC bridge, the config service, and the TTS queue
 * singleton. The queue mock captures `enqueue` / `playNow` calls so
 * tests can assert on them without dragging in the Web Speech API.
 */

import type { TMessage } from '@/common/chat/chatLib';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── IPC mock ────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  setVoiceMode: undefined as undefined | ((p: { id: string; enabled: boolean; session_id?: string }) => Promise<void>),
  updateConversation: undefined as
    | undefined
    | ((p: { id: string; updates: Record<string, unknown>; merge_extra?: boolean }) => Promise<boolean>),
  getConversation: undefined as undefined | ((p: { id: string }) => Promise<unknown>),
  // The TTS queue mock; we capture every call into these arrays.
  enqueueCalls: [] as Array<{ id: string; text: string }>,
  playNowCalls: [] as Array<{ id: string; text: string }>,
  subscribeListeners: new Set<(state: unknown) => void>(),
  getStateReturn: {
    currentId: null as string | null,
    status: 'idle' as 'idle' | 'playing' | 'paused',
    queuedIds: [] as string[],
  },
  enqueue: undefined as undefined | ((item: { id: string; text: string }) => void),
  playNow: undefined as undefined | ((item: { id: string; text: string }) => void),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: {
        invoke: vi.fn(async (p: { id: string; updates: Record<string, unknown>; merge_extra?: boolean }) => {
          h.updateConversation?.(p);
          return true;
        }),
      },
      get: {
        invoke: vi.fn(async (p: { id: string }) => {
          h.getConversation?.(p);
          return null;
        }),
      },
    },
    remoteAgent: {
      setVoiceMode: {
        invoke: vi.fn(async (p: { id: string; enabled: boolean; session_id?: string }) => {
          h.setVoiceMode?.(p);
          return undefined;
        }),
      },
    },
  },
}));

// configService is the source of truth for `tools.textToSpeech`. We
// seed an "enabled + autoPlay" config and let tests mutate the cache
// via `setConfig` helpers.
let configStore: unknown = {
  enabled: true,
  provider: 'system',
  voiceModeDefault: false,
  autoPlay: true,
  system: { voice: '', rate: 1 },
  openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
};

vi.mock('@/common/config/configService', () => ({
  configService: {
    // Only return the TTS config when explicitly asked — other keys
    // (e.g. `customCss` read by ShadowView) must return undefined so
    // the consumers can short-circuit. Using a real Map would be nicer
    // but a tiny discriminated getter keeps the mock self-contained.
    get: vi.fn((key: string) => (key === 'tools.textToSpeech' ? configStore : undefined)),
    set: vi.fn(),
    setLocal: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    whenReady: vi.fn(async () => undefined),
    initialize: vi.fn(async () => undefined),
    isInitialized: vi.fn(() => true),
    reset: vi.fn(),
  },
}));

// Replace the real TTS queue with a tiny fake that records every call.
// We mock the *module* (not the singleton accessor) so all components
// see the same fake instance.
vi.mock('@/renderer/services/tts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/renderer/services/tts');
  return {
    ...actual,
    getTtsQueue: () => ({
      enqueue: (item: { id: string; text: string }) => {
        h.enqueueCalls.push(item);
        h.enqueue?.(item);
      },
      playNow: (item: { id: string; text: string }) => {
        h.playNowCalls.push(item);
        h.playNow?.(item);
      },
      pause: vi.fn(),
      resume: vi.fn(),
      skip: vi.fn(),
      stop: vi.fn(),
      clear: vi.fn(),
      setConfig: vi.fn(),
      getState: () => h.getStateReturn,
      subscribe: (cb: (state: unknown) => void) => {
        h.subscribeListeners.add(cb);
        return () => h.subscribeListeners.delete(cb);
      },
    }),
  };
});

// Same pattern as the revert test: stub the conversation cache, the
// layout/theme/i18n surfaces, the Arco Message static methods, and the
// icon-park icons. We also stub `useRemoveMessageByMsgId` to a no-op so
// the MessageText hook chain resolves.
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(async () => null),
  refreshConversationCache: vi.fn(),
}));

// SendBox calls `usePreviewContext()` to register a "send to box"
// handler. We stub the hook with a no-op implementation so SendBox
// doesn't have to drag in the real PreviewProvider tree.
vi.mock('@/renderer/pages/conversation/Preview', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/renderer/pages/conversation/Preview');
  return {
    ...actual,
    usePreviewContext: () => ({
      setSendBoxHandler: () => () => undefined,
      domSnippets: [],
      addDomSnippet: () => undefined,
      removeDomSnippet: () => undefined,
      clearDomSnippets: () => undefined,
    }),
  };
});

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

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    theme: 'light',
    setTheme: () => {},
    resolvedTheme: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/renderer/utils/emitter', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/renderer/utils/emitter');
  return {
    ...actual,
    emitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  };
});
vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/renderer/pages/conversation/Messages/hooks');
  return {
    ...actual,
    useRemoveMessageByMsgId: () => () => undefined,
  };
});

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
    PlayOne: StubIcon,
    PauseOne: StubIcon,
    RightOne: StubIcon,
    VoiceOne: StubIcon,
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTextMessage(opts: { id: string; content: string; position: 'left' | 'right' }): TMessage {
  return {
    id: opts.id,
    type: 'text',
    msg_id: `msg-${opts.id}`,
    position: opts.position,
    conversation_id: 'conv-1',
    created_at: Date.now(),
    content: { content: opts.content },
  } as unknown as TMessage;
}

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { ipcBridge } from '@/common';

type IpcBridgeMock = {
  conversation: { update: { invoke: ReturnType<typeof vi.fn> }; get: { invoke: ReturnType<typeof vi.fn> } };
  remoteAgent: { setVoiceMode: { invoke: ReturnType<typeof vi.fn> } };
};
const mockedIpc = ipcBridge as unknown as IpcBridgeMock;

// Lazy import the component so the mocks above are wired before the
// component module evaluates.
const loadMessageText = async () =>
  (await import('@/renderer/pages/conversation/Messages/components/MessageText')).default;
const loadSendBox = async () => (await import('@/renderer/components/chat/sendbox')).default;

function Shell({
  children,
  type = 'remote',
  extra,
  voiceMode,
}: {
  children: React.ReactNode;
  type?: 'remote' | 'acp';
  extra?: Record<string, unknown>;
  voiceMode?: boolean;
}) {
  // If `voiceMode` is provided, override extra so the toggle button
  // reads it.
  const finalExtra: Record<string, unknown> = { ...extra };
  if (voiceMode !== undefined) {
    finalExtra.voice_mode = voiceMode;
  }
  return (
    <ConversationProvider value={{ conversation_id: 'conv-1', workspace: '/ws', type, extra: finalExtra }}>
      {children}
    </ConversationProvider>
  );
}

describe('Bet B — voice-mode spoken row + toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    h.setVoiceMode = undefined;
    h.updateConversation = undefined;
    h.getConversation = undefined;
    h.enqueueCalls = [];
    h.playNowCalls = [];
    h.subscribeListeners.clear();
    h.getStateReturn = { currentId: null, status: 'idle', queuedIds: [] };
    h.enqueue = undefined;
    h.playNow = undefined;
    configStore = {
      enabled: true,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── (a) Spoken-row rendering ──────────────────────────────────────────
  it('a1. assistant message with complete spoken block: renders SpokenRow, hides raw fence', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({
      id: 'm-1',
      position: 'left',
      content: 'Here is the plan.\n\n```spoken\nI just set the timer to 5 minutes. You can stop it anytime.\n```',
    });
    const { container } = render(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    // The spoken row is present.
    const spokenRow = container.querySelector('[data-testid="spoken-row"]');
    expect(spokenRow).not.toBeNull();
    expect(spokenRow?.getAttribute('data-voice-status')).toBe('idle');
    // The play control is rendered (idle → play).
    expect(container.querySelector('[data-testid="spoken-row-play"]')).not.toBeNull();
    // The text is shown.
    expect(spokenRow?.textContent).toContain('I just set the timer to 5 minutes');
    // The raw fence must not be in the markdown body. (The rendered
    // DOM doesn't expose the source markdown directly, but we can
    // assert the [data-testid="message-text-content"] subtree doesn't
    // contain the spoken summary or any ``` characters.)
    const messageText = container.querySelector('[data-testid="message-text-content"]');
    expect(messageText).not.toBeNull();
    expect(messageText?.textContent).not.toContain('```');
    expect(messageText?.textContent).not.toContain('I just set the timer');
  });

  it('a2. assistant message without spoken block: no SpokenRow', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({ id: 'm-1', position: 'left', content: 'No fence here, just text.' });
    const { container } = render(
      <Shell>
        <MessageText message={message} />
      </Shell>
    );
    expect(container.querySelector('[data-testid="spoken-row"]')).toBeNull();
  });

  it('a3. user message with spoken block: no SpokenRow (gated on assistant)', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({
      id: 'm-1',
      position: 'right',
      content: 'User text.\n\n```spoken\nI am the user, this should not render a row.\n```',
    });
    const { container } = render(
      <Shell>
        <MessageText message={message} />
      </Shell>
    );
    expect(container.querySelector('[data-testid="spoken-row"]')).toBeNull();
  });

  it('a4. play button click calls queue.playNow with the spoken text', async () => {
    const MessageText = await loadMessageText();
    const spoken = 'The quick brown fox jumps over the lazy dog.';
    const message = makeTextMessage({
      id: 'm-play',
      position: 'left',
      content: `Body text.\n\n\`\`\`spoken\n${spoken}\n\`\`\``,
    });
    const { container } = render(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    const playButton = container.querySelector('[data-testid="spoken-row-play"]') as HTMLElement | null;
    expect(playButton).not.toBeNull();
    fireEvent.click(playButton!);
    expect(h.playNowCalls).toHaveLength(1);
    expect(h.playNowCalls[0]).toEqual({ id: 'm-play', text: spoken });
  });

  it('a5. auto-enqueue: when voice_mode effective + autoPlay=true, enqueue runs once', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({
      id: 'm-auto',
      position: 'left',
      content: 'Body.\n\n```spoken\nAuto-enqueue me.\n```',
    });
    render(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    await waitFor(() => expect(h.enqueueCalls).toHaveLength(1));
    expect(h.enqueueCalls[0]).toEqual({ id: 'm-auto', text: 'Auto-enqueue me.' });
  });

  it('a6. auto-enqueue: when voice_mode off, enqueue is NOT called', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({
      id: 'm-off',
      position: 'left',
      content: 'Body.\n\n```spoken\nShould not be enqueued.\n```',
    });
    render(
      <Shell voiceMode={false}>
        <MessageText message={message} />
      </Shell>
    );
    // Give effects a tick to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(h.enqueueCalls).toHaveLength(0);
  });

  it('a7. auto-enqueue: when autoPlay is false, enqueue is NOT called even with voice mode on', async () => {
    configStore = {
      enabled: true,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: false,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
    const MessageText = await loadMessageText();
    const message = makeTextMessage({
      id: 'm-noplay',
      position: 'left',
      content: 'Body.\n\n```spoken\nManual only.\n```',
    });
    render(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(h.enqueueCalls).toHaveLength(0);
  });

  it('a8. auto-enqueue: streaming re-renders do not spam the queue (dedupe by id)', async () => {
    const MessageText = await loadMessageText();
    const message = makeTextMessage({
      id: 'm-stream',
      position: 'left',
      content: 'Body.\n\n```spoken\nStable.\n```',
    });
    const { rerender } = render(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    await waitFor(() => expect(h.enqueueCalls).toHaveLength(1));
    // Re-render the same content (simulates a streaming re-render where
    // the message content is unchanged but a parent component triggers
    // a render).
    rerender(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    rerender(
      <Shell voiceMode={true}>
        <MessageText message={message} />
      </Shell>
    );
    expect(h.enqueueCalls).toHaveLength(1);
  });

  // ─── (b) Voice-mode toggle in sendbox ─────────────────────────────────
  it('b1. click voice-mode toggle: persists extra.voice_mode and pushes setVoiceMode', async () => {
    // Remote conversation with no voice_mode override; the global
    // config has voiceModeDefault=false so effective starts at false.
    configStore = {
      enabled: true,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
    const SendBox = await loadSendBox();
    const onSend = vi.fn(async () => undefined);
    const { container } = render(
      <Shell extra={{ remoteAgentId: 'agent-1', sessionKey: 'sess-1' }}>
        <SendBox onSend={onSend} value='' onChange={() => undefined} />
      </Shell>
    );
    const toggle = container.querySelector('[data-testid="sendbox-voice-mode-btn"]') as HTMLElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle!);

    await waitFor(() => expect(mockedIpc.conversation.update.invoke).toHaveBeenCalledTimes(1));
    expect(mockedIpc.conversation.update.invoke).toHaveBeenCalledWith({
      id: 'conv-1',
      updates: { extra: { voice_mode: true } },
      merge_extra: true,
    });
    await waitFor(() => expect(mockedIpc.remoteAgent.setVoiceMode.invoke).toHaveBeenCalledTimes(1));
    expect(mockedIpc.remoteAgent.setVoiceMode.invoke).toHaveBeenCalledWith({
      id: 'agent-1',
      enabled: true,
      session_id: 'sess-1',
    });
  });

  it('b2. click voice-mode toggle when session_key absent: push omits session_id (agent-global)', async () => {
    configStore = {
      enabled: true,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
    const SendBox = await loadSendBox();
    const onSend = vi.fn(async () => undefined);
    const { container } = render(
      <Shell extra={{ remoteAgentId: 'agent-2' }}>
        <SendBox onSend={onSend} value='' onChange={() => undefined} />
      </Shell>
    );
    const toggle = container.querySelector('[data-testid="sendbox-voice-mode-btn"]') as HTMLElement | null;
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);
    await waitFor(() => expect(mockedIpc.remoteAgent.setVoiceMode.invoke).toHaveBeenCalledTimes(1));
    const call = mockedIpc.remoteAgent.setVoiceMode.invoke.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toEqual({ id: 'agent-2', enabled: true });
    expect(Object.prototype.hasOwnProperty.call(call, 'session_id')).toBe(false);
  });

  it('b3. non-remote conversation: voice-mode toggle is hidden', async () => {
    configStore = {
      enabled: true,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
    const SendBox = await loadSendBox();
    const onSend = vi.fn(async () => undefined);
    const { container } = render(
      <ConversationProvider value={{ conversation_id: 'conv-1', workspace: '/ws', type: 'acp' }}>
        <SendBox onSend={onSend} value='' onChange={() => undefined} />
      </ConversationProvider>
    );
    expect(container.querySelector('[data-testid="sendbox-voice-mode-btn"]')).toBeNull();
  });

  it('b4. TTS disabled in config: voice-mode toggle is hidden (TTS not enabled)', async () => {
    configStore = {
      enabled: false,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
    const SendBox = await loadSendBox();
    const onSend = vi.fn(async () => undefined);
    const { container } = render(
      <Shell extra={{ remoteAgentId: 'agent-3', sessionKey: 'sess-3' }}>
        <SendBox onSend={onSend} value='' onChange={() => undefined} />
      </Shell>
    );
    expect(container.querySelector('[data-testid="sendbox-voice-mode-btn"]')).toBeNull();
  });

  it('b5. toggle on: button shows pressed state (aria-pressed=true)', async () => {
    configStore = {
      enabled: true,
      provider: 'system',
      voiceModeDefault: false,
      autoPlay: true,
      system: { voice: '', rate: 1 },
      openai: { apiKey: '', baseUrl: '', model: 'tts-1', voice: 'alloy' },
    };
    const SendBox = await loadSendBox();
    const onSend = vi.fn(async () => undefined);
    const { container } = render(
      <Shell extra={{ remoteAgentId: 'agent-4' }} voiceMode={true}>
        <SendBox onSend={onSend} value='' onChange={() => undefined} />
      </Shell>
    );
    const toggle = container.querySelector('[data-testid="sendbox-voice-mode-btn"]') as HTMLElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.getAttribute('data-voice-mode-active')).toBe('true');
  });
});
