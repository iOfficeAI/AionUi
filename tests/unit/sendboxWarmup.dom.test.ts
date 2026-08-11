/**
 * Unit tests for SendBox warmup debounce logic
 * Tests the 1-second debounce behavior for conversation.warmup.invoke
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';

// --- Mocks ---

const mockWarmupInvoke = vi.fn().mockResolvedValue(undefined);
const mockUseConversationContextSafe = vi.fn(() => ({ conversationId: 'test-conv-1' }));
const mockUseLayoutContext = vi.fn(() => ({ isMobile: false }));
const mockUsePreviewContext = vi.fn(() => ({
  setSendBoxHandler: vi.fn(),
  domSnippets: [],
  removeDomSnippet: vi.fn(),
  clearDomSnippets: vi.fn(),
}));
const mockUseInputFocusRing = vi.fn(() => ({
  activeBorderColor: '#000',
  inactiveBorderColor: '#ccc',
  activeShadow: '0 0 0 2px rgba(0,0,0,0.1)',
}));
const mockUseCompositionInput = vi.fn(() => ({
  compositionHandlers: {},
  createKeyDownHandler: vi.fn(() => vi.fn()),
}));
const mockUseDragUpload = vi.fn(() => ({
  isFileDragging: false,
  dragHandlers: {},
}));
const mockUsePasteService = vi.fn(() => ({
  onPaste: vi.fn(),
  onFocus: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: (...args: unknown[]) => mockWarmupInvoke(...args),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => mockUseConversationContextSafe(),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => mockUseLayoutContext(),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => mockUsePreviewContext(),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => mockUseInputFocusRing(),
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => mockUseCompositionInput(),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => mockUseDragUpload(),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => mockUsePasteService(),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ onClick, children, icon, ...props }: React.ComponentProps<'button'>) =>
    React.createElement('button', { onClick, ...props }, icon ?? children),
  Input: {
    TextArea: ({ onFocus, onBlur, ...props }: React.ComponentProps<'textarea'>) =>
      React.createElement('textarea', { onFocus, onBlur, ...props }),
  },
  Message: {
    useMessage: () => [{ warning: vi.fn() }, null],
  },
  Tag: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children),
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, {}, children),
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => React.createElement('span', {}, 'ArrowUp'),
  CloseSmall: () => React.createElement('span', {}, 'CloseSmall'),
  Square: () => React.createElement('span', {}, 'Square'),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en-US',
    },
  }),
}));

vi.mock('@renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: (value: unknown) => ({ current: value }),
}));

vi.mock('@renderer/services/FileService', () => ({
  allSupportedExts: [],
}));

vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'SlashCommandMenu'),
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: () => ({
    isOpen: false,
    filteredCommands: [],
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    onSelectByIndex: vi.fn(),
    onKeyDown: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'SpeechInputButton'),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
  shouldBlockMobileInputFocus: vi.fn(() => false),
}));

import SendBox from '@/renderer/components/chat/sendbox';

// --- Tests ---

describe('SendBox warmup debounce logic', () => {
  const focusWithUserIntent = (textarea: HTMLTextAreaElement) => {
    fireEvent.mouseDown(textarea);
    fireEvent.focus(textarea);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockUseConversationContextSafe.mockReturnValue({ conversationId: 'test-conv-1' });
    mockUseLayoutContext.mockReturnValue({ isMobile: false });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('triggers warmup after 1s when focus follows explicit user intent', () => {
    const { container } = render(
      React.createElement(SendBox, {
        onSend: vi.fn().mockResolvedValue(undefined),
      })
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    // Focus the textarea after explicit user interaction
    focusWithUserIntent(textarea!);

    // Verify warmup not called immediately
    expect(mockWarmupInvoke).not.toHaveBeenCalled();

    // Advance timers by 1000ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Verify warmup was called with correct conversation_id
    expect(mockWarmupInvoke).toHaveBeenCalledTimes(1);
    expect(mockWarmupInvoke).toHaveBeenCalledWith({ conversation_id: 'test-conv-1' });
  });

  it('cancels warmup on blur before 1s', () => {
    const { container } = render(
      React.createElement(SendBox, {
        onSend: vi.fn().mockResolvedValue(undefined),
      })
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    // Focus the textarea
    focusWithUserIntent(textarea!);

    // Advance 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Blur before 1s
    fireEvent.blur(textarea!);

    // Advance 1000ms more
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Verify warmup was NOT called
    expect(mockWarmupInvoke).not.toHaveBeenCalled();
  });

  it('does not re-trigger warmup for same conversation after repeated user focus', () => {
    const { container, unmount } = render(
      React.createElement(SendBox, {
        onSend: vi.fn().mockResolvedValue(undefined),
      })
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    // First focus
    focusWithUserIntent(textarea!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Verify warmup called once
    expect(mockWarmupInvoke).toHaveBeenCalledTimes(1);
    expect(mockWarmupInvoke).toHaveBeenCalledWith({ conversation_id: 'test-conv-1' });

    // Blur
    fireEvent.blur(textarea!);

    // Focus again with same conversation
    focusWithUserIntent(textarea!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Verify warmup NOT called again (same conversation)
    expect(mockWarmupInvoke).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('triggers warmup again after explicit focus in a different conversation', () => {
    // First render with conv-1
    mockUseConversationContextSafe.mockReturnValue({ conversationId: 'test-conv-1' });
    const { container, unmount } = render(
      React.createElement(SendBox, {
        onSend: vi.fn().mockResolvedValue(undefined),
      })
    );

    const textarea1 = container.querySelector('textarea');
    expect(textarea1).toBeTruthy();

    // Focus and trigger warmup for conv-1
    focusWithUserIntent(textarea1!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockWarmupInvoke).toHaveBeenCalledTimes(1);
    expect(mockWarmupInvoke).toHaveBeenCalledWith({ conversation_id: 'test-conv-1' });

    unmount();

    // Remount with conv-2
    mockUseConversationContextSafe.mockReturnValue({ conversationId: 'test-conv-2' });
    const { container: container2 } = render(
      React.createElement(SendBox, {
        onSend: vi.fn().mockResolvedValue(undefined),
      })
    );

    const textarea2 = container2.querySelector('textarea');
    expect(textarea2).toBeTruthy();

    // Focus and trigger warmup for conv-2
    focusWithUserIntent(textarea2!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Verify warmup called twice with different conversation IDs
    expect(mockWarmupInvoke).toHaveBeenCalledTimes(2);
    expect(mockWarmupInvoke).toHaveBeenNthCalledWith(1, { conversation_id: 'test-conv-1' });
    expect(mockWarmupInvoke).toHaveBeenNthCalledWith(2, { conversation_id: 'test-conv-2' });
  });
});
