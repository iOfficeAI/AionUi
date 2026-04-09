/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

let capturedResponseHandler: ((msg: Record<string, unknown>) => void) | null = null;
const mockConvGet = vi.fn().mockResolvedValue({
  id: 'conv-1',
  status: 'finished',
  extra: { workspace: '/tmp/ws', remoteAgentId: 'agent-1' },
});
const mockSendMessage = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockRemoteGet = vi.fn().mockResolvedValue({ name: 'TestBot', avatar: '🤖' });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) || key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConvGet(...args) },
      sendMessage: { invoke: (...args: unknown[]) => mockSendMessage(...args) },
      stop: { invoke: (...args: unknown[]) => mockStop(...args) },
      responseStream: {
        on: (handler: (msg: Record<string, unknown>) => void) => {
          capturedResponseHandler = handler;
          return () => {
            capturedResponseHandler = null;
          };
        },
      },
    },
    remoteAgent: {
      get: { invoke: (...args: unknown[]) => mockRemoteGet(...args) },
    },
  },
}));

vi.mock('../../src/common/utils', () => ({
  uuid: () => 'test-uuid',
}));

vi.mock('../../src/common/chat/chatLib', () => ({
  transformMessage: (msg: unknown) => msg,
}));

const mockMutateDraft = vi.fn();
vi.mock('../../src/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: () => () => ({
    data: { _type: 'remote', atPath: [], content: '', uploadFile: [] },
    mutate: mockMutateDraft,
  }),
}));

vi.mock('../../src/renderer/hooks/chat/useSendBoxFiles', () => ({
  createSetUploadFile: () => vi.fn(),
}));

const mockAddOrUpdateMessage = vi.fn();
const mockRemoveMessageByMsgId = vi.fn();
vi.mock('../../src/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
  useRemoveMessageByMsgId: () => mockRemoveMessageByMsgId,
}));

vi.mock('../../src/renderer/hooks/system/useCommandQueueEnabled', () => ({
  useCommandQueueEnabled: () => true,
}));

vi.mock('../../src/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  shouldEnqueueConversationCommand: () => false,
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: vi.fn(),
    update: vi.fn(),
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

vi.mock('../../src/renderer/services/FileService', () => ({
  allSupportedExts: ['.ts', '.tsx'],
}));

vi.mock('../../src/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
  useAddEventListener: vi.fn(),
}));

vi.mock('../../src/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn((a: unknown) => a),
}));

vi.mock('../../src/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: vi.fn((input: string) => input),
}));

vi.mock('../../src/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ setSendBoxHandler: vi.fn() }),
}));

vi.mock('../../src/renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: (val: unknown) => ({ current: val }),
}));

vi.mock('../../src/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({ openFileSelector: vi.fn() }),
}));

vi.mock('../../src/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({ checkAndUpdateTitle: vi.fn() }),
}));

// Mock the child components
vi.mock('../../src/renderer/components/chat/sendbox', () => ({
  default: (props: {
    value: string;
    placeholder: string;
    loading: boolean;
    onSend: (msg: string) => void;
    onStop: () => void;
    prefix?: React.ReactNode;
    tools?: React.ReactNode;
  }) => (
    <div data-testid='sendbox'>
      <span data-testid='placeholder'>{props.placeholder}</span>
      <input data-testid='sendbox-input' value={props.value} readOnly />
      <button data-testid='send-btn' onClick={() => props.onSend(props.value)}>
        Send
      </button>
      {props.loading && <span data-testid='loading'>Loading</span>}
      <button data-testid='stop-btn' onClick={props.onStop}>
        Stop
      </button>
    </div>
  ),
}));

vi.mock('../../src/renderer/components/chat/ThoughtDisplay', () => ({
  default: ({ thought, running }: { thought: { subject: string; description: string }; running: boolean }) => (
    <div data-testid='thought-display'>
      {running && <span data-testid='thought-running'>Running</span>}
      {thought.description && <span data-testid='thought-desc'>{thought.description}</span>}
    </div>
  ),
}));

vi.mock('../../src/renderer/components/chat/CommandQueuePanel', () => ({
  default: () => <div data-testid='queue-panel' />,
}));

vi.mock('../../src/renderer/components/media/FilePreview', () => ({
  default: () => <div data-testid='file-preview' />,
}));

vi.mock('../../src/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='file-list'>{children}</div>,
}));

vi.mock('../../src/renderer/components/media/FileAttachButton', () => ({
  default: () => <button data-testid='file-attach'>Attach</button>,
}));

import RemoteSendBox from '../../src/renderer/pages/conversation/platforms/remote/RemoteSendBox';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemoteSendBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedResponseHandler = null;
    sessionStorage.clear();
  });

  it('renders the sendbox component', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    expect(screen.getByTestId('sendbox')).toBeTruthy();
  });

  it('loads conversation data on mount', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    // Wait for effects
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockConvGet).toHaveBeenCalledWith({ id: 'conv-1' });
  });

  it('loads remote agent name on mount', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockRemoteGet).toHaveBeenCalledWith({ id: 'agent-1' });
  });

  it('registers response stream handler', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    expect(capturedResponseHandler).not.toBeNull();
  });

  it('handles finish event by resetting processing state', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    // First trigger content to set aiProcessing
    await act(async () => {
      capturedResponseHandler?.({
        type: 'content',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: 'hello',
      });
    });

    expect(screen.getByTestId('loading')).toBeTruthy();

    // Now trigger finish
    await act(async () => {
      capturedResponseHandler?.({
        type: 'finish',
        conversation_id: 'conv-1',
        msg_id: 'msg-2',
        data: null,
      });
    });

    expect(screen.queryByTestId('loading')).toBeNull();
  });

  it('handles content event by adding message and setting processing state', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      capturedResponseHandler?.({
        type: 'content',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: 'hello world',
      });
    });

    expect(mockAddOrUpdateMessage).toHaveBeenCalled();
    expect(screen.getByTestId('loading')).toBeTruthy();
  });

  it('handles thought event by showing thought display', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      capturedResponseHandler?.({
        type: 'thought',
        conversation_id: 'conv-1',
        msg_id: 'msg-t',
        data: { subject: 'Thinking', description: 'processing...' },
      });
    });

    expect(screen.getByTestId('thought-running')).toBeTruthy();
  });

  it('ignores events from other conversations', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      capturedResponseHandler?.({
        type: 'content',
        conversation_id: 'conv-other',
        msg_id: 'msg-1',
        data: 'should be ignored',
      });
    });

    expect(mockAddOrUpdateMessage).not.toHaveBeenCalled();
  });

  it('handles agent_status event', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      capturedResponseHandler?.({
        type: 'agent_status',
        conversation_id: 'conv-1',
        msg_id: 'msg-s',
        data: { status: 'connected' },
      });
    });

    expect(mockAddOrUpdateMessage).toHaveBeenCalled();
  });

  it('handles unknown event types via default case', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      capturedResponseHandler?.({
        type: 'error',
        conversation_id: 'conv-1',
        msg_id: 'msg-e',
        data: 'something failed',
      });
    });

    expect(mockAddOrUpdateMessage).toHaveBeenCalled();
  });

  it('processes initial message from sessionStorage', async () => {
    sessionStorage.setItem('remote_initial_message_conv-1', JSON.stringify({ input: 'hello', files: [] }));

    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    // Wait for the 300ms timer + processing
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'conv-1', input: 'hello' })
    );
    expect(mockAddOrUpdateMessage).toHaveBeenCalled();
  });

  it('does not process initial message if already processed', async () => {
    sessionStorage.setItem('remote_initial_message_conv-1', JSON.stringify({ input: 'hello' }));
    sessionStorage.setItem('remote_initial_processed_conv-1', 'true');

    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('handles acp_permission event type as content', async () => {
    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      capturedResponseHandler?.({
        type: 'acp_permission',
        conversation_id: 'conv-1',
        msg_id: 'msg-p',
        data: { options: [] },
      });
    });

    expect(mockAddOrUpdateMessage).toHaveBeenCalled();
    expect(screen.getByTestId('loading')).toBeTruthy();
  });

  it('sets aiProcessing false when conversation status is not running', async () => {
    mockConvGet.mockResolvedValueOnce({
      id: 'conv-1',
      status: 'finished',
      extra: { workspace: '/tmp', remoteAgentId: 'agent-1' },
    });

    await act(async () => {
      render(<RemoteSendBox conversation_id='conv-1' />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(screen.queryByTestId('loading')).toBeNull();
  });
});
