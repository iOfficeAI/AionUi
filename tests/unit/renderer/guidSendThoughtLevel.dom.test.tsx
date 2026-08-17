/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for the thought-level send path (see PR #3734, P1).
 *
 * An untouched thought-level picker must NOT override the assistant's backend
 * default. GuidPage's defaults effect leaves the selection empty (`''`) when
 * the backend reports no current value, and the send path serializes that
 * empty selection to `thought_level: undefined` — so no explicit override
 * reaches `conversation.create`. This locks the end-to-end contract: an empty
 * `selectedThoughtLevelValue` never leaks a concrete level (e.g. `options[0]`)
 * into the create request.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ipcBridge } from '@/common';
import { useGuidSend, type GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  toSessionMcpServer: (server: unknown) => server,
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationCreateErrorMessage: vi.fn(() => 'error'),
}));

const createInvoke = ipcBridge.conversation.create.invoke as unknown as ReturnType<typeof vi.fn>;

const buildDeps = (overrides: Partial<GuidSendDeps> = {}): GuidSendDeps => {
  const noop = vi.fn();
  return {
    input: 'hello',
    setInput: noop,
    files: [],
    setFiles: noop,
    dir: '',
    setDir: noop,
    setLoading: noop,
    loading: false,
    selectedAssistantId: 'assistant-1',
    // Non-aionrs backend → exercises the ACP create path.
    selectedAssistantBackend: 'gemini',
    selectedMode: '',
    selectedAcpModel: null,
    // Untouched picker: no backend current, no user pick.
    selectedThoughtLevelValue: '',
    currentAcpCachedModelInfo: null,
    current_model: undefined,
    guidDisabledBuiltinSkills: undefined,
    guidEnabledSkills: undefined,
    availableMcpServers: [],
    selectedMcpServerIds: undefined,
    isGoogleAuth: false,
    setMentionOpen: noop,
    setMentionQuery: noop,
    setMentionSelectorOpen: noop,
    setMentionActiveIndex: noop,
    navigate: vi.fn(async () => undefined) as unknown as GuidSendDeps['navigate'],
    t: ((key: string) => key) as unknown as GuidSendDeps['t'],
    localeKey: 'en-US',
    ...overrides,
  };
};

describe('useGuidSend — thought-level send path (PR #3734, P1)', () => {
  beforeEach(() => {
    createInvoke.mockReset();
    createInvoke.mockResolvedValue({ id: 'conversation-1' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('serializes an untouched (empty) thought-level selection as thought_level: undefined', async () => {
    const { result } = renderHook(() => useGuidSend(buildDeps()));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(createInvoke).toHaveBeenCalledTimes(1);
    const payload = createInvoke.mock.calls[0][0];
    const overrides = payload.assistant.conversation_overrides;
    // The empty selection must not leak a concrete level into the create request.
    expect(overrides.thought_level).toBeUndefined();
  });
});
