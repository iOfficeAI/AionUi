/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'var(--color-primary-6)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'side-entry-conversation', type: 'acp' }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));

vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({ isOpen: false }),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hooks/system/useLiveTranscriptInsertion')>();
  return {
    ...actual,
    useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
  };
});

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({ answer: '', question: '', isLoading: false, isOpen: false, ask: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));

// The real emitter drives the scoped fill/reply lanes under test.
import { emitter } from '@/renderer/utils/emitter';
import SendBox from '@/renderer/components/chat/SendBox';

type RenderOptions = {
  value?: string;
  onChange?: (value: string) => void;
  enableSide?: boolean;
  onOpenSide?: (firstQuestion?: string) => void;
  conversationScopeId?: string;
  isSideComposer?: boolean;
};

function renderSendBox(options: RenderOptions = {}) {
  return render(
    <SendBox
      value={options.value ?? ''}
      onChange={options.onChange ?? vi.fn()}
      onSend={vi.fn().mockResolvedValue(undefined)}
      enableSide={options.enableSide}
      onOpenSide={options.onOpenSide}
      conversationScopeId={options.conversationScopeId}
      isSideComposer={options.isSideComposer}
      defaultMultiLine
      lockMultiLine
      allowSendWhileLoading
    />
  );
}

// Submit through the send button — it shares the same sendMessageHandler
// interception chain as Enter, without the slash-menu overlay keydown lane.
const sendButton = () => screen.getByTestId('sendbox-send-btn');

beforeEach(() => {
  emitter.removeAllListeners();
});

describe('SendBox side entry', () => {
  it('intercepts /side <question> on send instead of sending into the main thread', async () => {
    const onOpenSide = vi.fn();
    const onChange = vi.fn();
    renderSendBox({ value: '/side what changed?', onChange, enableSide: true, onOpenSide });

    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(onOpenSide).toHaveBeenCalledWith('what changed?');
    });
    // Input is cleared and the normal send path never fires.
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('intercepts a bare /side as an open without a question', async () => {
    const onOpenSide = vi.fn();
    renderSendBox({ value: '/side ', onChange: vi.fn(), enableSide: true, onOpenSide });

    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(onOpenSide).toHaveBeenCalledWith(undefined);
    });
  });

  it('sends normally when side is not enabled', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<SendBox value='/side hello' onChange={vi.fn()} onSend={onSend} allowSendWhileLoading />);

    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('/side hello');
    });
  });

  it('shows the icon trigger only when side is enabled and opens on click', async () => {
    const onOpenSide = vi.fn();
    const { rerender } = renderSendBox({ enableSide: true, onOpenSide });

    const trigger = screen.getByTestId('sendbox-side-trigger');
    fireEvent.click(trigger);
    expect(onOpenSide).toHaveBeenCalledTimes(1);

    rerender(
      <SendBox value='' onChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} allowSendWhileLoading />
    );
    expect(screen.queryByTestId('sendbox-side-trigger')).toBeFalsy();
  });

  it('opens the side panel via Cmd/Ctrl+Shift+S', () => {
    const onOpenSide = vi.fn();
    renderSendBox({ enableSide: true, onOpenSide });

    fireEvent.keyDown(window, { key: 's', shiftKey: true, metaKey: true });

    expect(onOpenSide).toHaveBeenCalledTimes(1);
  });

  it('consumes scoped composer fills only for its own conversation', () => {
    const onChange = vi.fn();
    const acks: Array<{ conversation_id: string; text: string }> = [];
    emitter.on('sendbox.fill.scoped.handled', (payload) => acks.push(payload));
    renderSendBox({ conversationScopeId: 'c1', onChange });

    emitter.emit('sendbox.fill.scoped', { conversation_id: 'c2', text: 'other tab' });
    expect(onChange).not.toHaveBeenCalled();

    emitter.emit('sendbox.fill.scoped', { conversation_id: 'c1', text: 'catch me up' });
    expect(onChange).toHaveBeenCalledWith('catch me up');
    expect(acks).toEqual([{ conversation_id: 'c1', text: 'catch me up' }]);
  });

  it('attaches scoped quotes as a reply chip and ignores global reply events', async () => {
    const acks: Array<{ conversation_id: string; content: string }> = [];
    emitter.on('sendbox.reply.scoped.handled', (payload) => acks.push(payload));
    renderSendBox({ conversationScopeId: 'c1' });

    emitter.emit('sendbox.reply', { messageId: 'm1', content: 'main thread reply', position: 'left' });
    expect(screen.queryByText('main thread reply')).toBeFalsy();

    emitter.emit('sendbox.reply.scoped', {
      conversation_id: 'c1',
      quote: { messageId: 'm1', content: 'selected snippet', position: 'left' },
    });
    await waitFor(() => {
      expect(screen.getByText('selected snippet')).toBeTruthy();
    });
    expect(acks).toEqual([{ conversation_id: 'c1', content: 'selected snippet' }]);
  });

  it('never offers the side trigger inside a side composer', () => {
    renderSendBox({ enableSide: true, onOpenSide: vi.fn(), isSideComposer: true, conversationScopeId: 'c1' });

    expect(screen.queryByTestId('sendbox-side-trigger')).toBeFalsy();
  });
});
