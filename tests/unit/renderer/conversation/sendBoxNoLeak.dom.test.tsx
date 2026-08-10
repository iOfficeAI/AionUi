/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for team-a no-leak: the send box's file-selection listeners
 * (`X.selected.file` set + `X.selected.file.append`) must accept an event ONLY
 * when it targets this box's conversation (or is untargeted). On the multi-column
 * team route, same-type peers share the type prefix, so without the id guard an
 * @mention / add-to-chat in one column would leak into the others.
 *
 * These tests use the REAL emitter + REAL useAddEventListener and observe the
 * atPath mutation (setAtPath → draft `mutate`): a mismatched-target event must
 * NOT mutate; a matching / undefined (broadcast) target must. Removing any guard
 * (the `targetConversationId === conversation_id` check) makes the mismatch case
 * mutate → these tests fail. (Verified by mutation while authoring.)
 */

import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { sendMessage: { invoke: vi.fn() } },
    conversation: { stop: { invoke: vi.fn() } },
  },
}));

// Stub the shared SendBox shell — the guards under test live in the platform
// send boxes themselves (their own useAddEventListener calls), not the shell.
vi.mock('@/renderer/components/chat/SendBox', () => ({ default: () => <div data-testid='sendbox-shell' /> }));
vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: () => null,
  useAttachEntry: () => ({ entries: [], hiddenFileInput: null }),
}));
vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FileAttachButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/HorizontalFileList', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/agent/useAcpModelInfo', () => ({
  useAcpModelInfo: () => ({ model_info: null, canSwitch: false, selectModel: vi.fn() }),
}));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: () => ({ mode: undefined, thoughtLevel: undefined, setConfigOption: vi.fn() }),
}));
// Draft hook: real setAtPath calls `mutate`; we spy `mutate` to observe accept/reject.
vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: () => () => ({
    data: { atPath: [], uploadFile: [], content: '' },
    mutate: mutateMock,
  }),
}));
vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  useSendBoxFiles: () => ({ handleFilesAdded: vi.fn(), clearFiles: vi.fn() }),
  createSetUploadFile: () => vi.fn(),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({ useAutoTitle: () => ({ checkAndUpdateTitle: vi.fn() }) }));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({ useConversationContextSafe: () => null }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({ openFileSelector: vi.fn(), onSlashBuiltinCommand: vi.fn() }),
}));
vi.mock('@/renderer/hooks/ui/useLatestRef', () => ({ useLatestRef: <T,>(v: T) => ({ current: v }) }));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({ useAddOrUpdateMessage: () => vi.fn() }));
vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  shouldEnqueueConversationCommand: () => false,
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    reorder: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    lockInteraction: vi.fn(),
    unlockInteraction: vi.fn(),
    resetActiveExecution: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ setSendBoxHandler: vi.fn() }) }));
vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage', () => ({
  useAionrsMessage: () => ({
    thought: null,
    running: false,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({ useTeamPermission: () => null }));
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({
    markSendStarted: vi.fn(),
    markSendAccepted: vi.fn(),
    markSendFailed: vi.fn(),
    hydrated: true,
    canSendMessage: true,
    isProcessing: false,
    state: 'idle',
    activeTurnId: null,
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/ensureConversationRuntime', () => ({
  ensureConversationRuntime: vi.fn(),
}));
vi.mock('@/renderer/services/FileService', () => ({ allSupportedExts: [] }));
// NOTE: emitter + useAddEventListener are NOT mocked — the real bus drives the guards.

import { emitter } from '@/renderer/utils/emitter';
import AcpSendBox from '@/renderer/pages/conversation/platforms/acp/AcpSendBox';
import AionrsSendBox from '@/renderer/pages/conversation/platforms/aionrs/AionrsSendBox';
import type { UseAcpMessageReturn } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

const CONV = 'conv-A';
const OTHER = 'conv-B';
const item = { path: '/x/a.ts', name: 'a.ts', isFile: true };

const acpMessageState = {
  aiProcessing: false,
  setAiProcessing: vi.fn(),
  resetState: vi.fn(),
  hasThinkingMessage: false,
  slashCommands: [],
} as unknown as UseAcpMessageReturn;

beforeEach(() => {
  mutateMock.mockClear();
  localStorage.clear();
});
afterEach(() => cleanup());

// Each case renders one send box (conversation_id = CONV), clears the mutate spy
// after mount, emits, then asserts whether the draft was mutated (setAtPath).
const scenarios = [
  {
    name: 'AcpSendBox',
    render: () => render(<AcpSendBox conversation_id={CONV} backend='claude' messageState={acpMessageState} />),
    setEvent: 'acp.selected.file' as const,
    appendEvent: 'acp.selected.file.append' as const,
  },
  {
    name: 'AionrsSendBox',
    render: () =>
      render(
        <AionrsSendBox
          conversation_id={CONV}
          modelSelection={{ current_model: { use_model: 'm', id: 'p' }, providers: [] } as never}
        />
      ),
    setEvent: 'aionrs.selected.file' as const,
    appendEvent: 'aionrs.selected.file.append' as const,
  },
];

describe.each(scenarios)('$name file-selection no-leak guard', ({ render: renderBox, setEvent, appendEvent }) => {
  const emitAndCount = (event: typeof setEvent | typeof appendEvent, target: string | undefined) => {
    mutateMock.mockClear();
    act(() => {
      emitter.emit(event, [item], target);
    });
    return mutateMock.mock.calls.length;
  };

  it('rejects a set event targeting a different conversation, accepts matching/broadcast', () => {
    renderBox();
    expect(emitAndCount(setEvent, OTHER)).toBe(0); // reject path — no atPath mutation
    expect(emitAndCount(setEvent, CONV)).toBeGreaterThan(0); // accept path
    expect(emitAndCount(setEvent, undefined)).toBeGreaterThan(0); // broadcast
  });

  it('rejects an append event targeting a different conversation, accepts matching/broadcast', () => {
    renderBox();
    expect(emitAndCount(appendEvent, OTHER)).toBe(0); // reject path — no atPath mutation
    expect(emitAndCount(appendEvent, CONV)).toBeGreaterThan(0); // accept path
    expect(emitAndCount(appendEvent, undefined)).toBeGreaterThan(0); // broadcast
  });
});
