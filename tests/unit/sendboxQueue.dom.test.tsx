/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SendBox from '@/renderer/components/chat/sendbox';

const mockWarmupInvoke = vi.fn().mockResolvedValue(undefined);
const mockWarning = vi.fn();
const mockHandlePasteFocus = vi.fn();
const mockOnPaste = vi.fn();
const mockBlurActiveElement = vi.fn();
const mockShouldBlockMobileInputFocus = vi.fn(() => false);
const mockSetSendBoxHandler = vi.fn();
const mockRemoveDomSnippet = vi.fn();
const mockClearDomSnippets = vi.fn();

let layoutState = { isMobile: false };
let conversationState: { conversationId?: string } = { conversationId: 'conversation-1' };
let previewState: {
  domSnippets: Array<{ id: string; tag: string; html: string }>;
  setSendBoxHandler: typeof mockSetSendBoxHandler;
  removeDomSnippet: typeof mockRemoveDomSnippet;
  clearDomSnippets: typeof mockClearDomSnippets;
} = {
  domSnippets: [],
  setSendBoxHandler: mockSetSendBoxHandler,
  removeDomSnippet: mockRemoveDomSnippet,
  clearDomSnippets: mockClearDomSnippets,
};
let dragUploadState = {
  isFileDragging: false,
  dragHandlers: {},
};
let uploadState = { isUploading: false };
let slashControllerArgs: {
  input: string;
  commands: Array<{ name: string; description?: string; kind?: string; source?: string }>;
  onExecuteBuiltin: (name: string) => void;
  onSelectTemplate: (name: string) => void;
} | null = null;
let slashControllerState = {
  isOpen: false,
  filteredCommands: [] as Array<{ name: string; description?: string; hint?: string }>,
  activeIndex: 0,
  setActiveIndex: vi.fn(),
  onSelectByIndex: vi.fn(),
  onKeyDown: vi.fn(),
};
let pasteServiceArgs: {
  onTextPaste?: (text: string) => void;
  conversationId?: string;
} | null = null;

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: (...args: unknown[]) => mockWarmupInvoke(...args),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: '#111111',
    inactiveBorderColor: '#cccccc',
    activeShadow: '0 0 0 2px rgba(0, 0, 0, 0.2)',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layoutState,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => conversationState,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => previewState,
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    compositionHandlers: {},
    createKeyDownHandler:
      (onSend: () => void, onSlashKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void) =>
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        onSlashKeyDown?.(event);
        if (event.key === 'Enter') {
          event.preventDefault();
          onSend();
        }
      },
  }),
}));

vi.mock('@renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => dragUploadState,
}));

vi.mock('@renderer/hooks/file/usePasteService', () => ({
  usePasteService: (args: typeof pasteServiceArgs) => {
    pasteServiceArgs = args;
    return {
      onPaste: mockOnPaste,
      onFocus: mockHandlePasteFocus,
    };
  },
}));

vi.mock('@renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => uploadState,
}));

vi.mock('@renderer/components/media/UploadProgressBar', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'upload-progress' }),
}));

vi.mock('@renderer/hooks/ui/useLatestRef', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    useLatestRef: <T,>(value: T) => {
      const ref = ReactModule.useRef(value);
      ref.current = value;
      return ref;
    },
  };
});

vi.mock('@renderer/services/FileService', () => ({
  allSupportedExts: ['.txt', '.ts'],
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: (args: typeof slashControllerArgs) => {
    slashControllerArgs = args;
    return slashControllerState;
  },
}));

vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({
  __esModule: true,
  default: ({
    title,
    hint,
    items,
    activeIndex,
    onHoverItem,
    onSelectItem,
    emptyText,
  }: {
    title: string;
    hint?: string;
    items: Array<{ key: string; label: string }>;
    activeIndex: number;
    onHoverItem: (index: number) => void;
    onSelectItem: (item: { key: string; label: string }) => void;
    emptyText: string;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'slash-menu', 'data-active-index': String(activeIndex) },
      React.createElement('div', {}, title),
      hint ? React.createElement('div', {}, hint) : null,
      items.length === 0
        ? React.createElement('div', {}, emptyText)
        : items.map((item, index) =>
            React.createElement(
              'button',
              {
                key: item.key,
                type: 'button',
                onMouseEnter: () => onHoverItem(index),
                onClick: () => onSelectItem(item),
              },
              item.label
            )
          )
    ),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: () => mockBlurActiveElement(),
  shouldBlockMobileInputFocus: () => mockShouldBlockMobileInputFocus(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => React.createElement('span', {}, 'ArrowUp'),
  CloseSmall: () => React.createElement('span', {}, 'CloseSmall'),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    className,
    disabled,
    onClick,
    type,
  }: {
    children?: React.ReactNode;
    icon?: React.ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    type?: string;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        className,
        disabled,
        onClick,
        'aria-label': className?.includes('send-button-custom') ? 'send' : type === 'secondary' ? 'stop' : undefined,
      },
      children ?? icon
    ),
  Input: {
    TextArea: ({
      children,
      autoSize: _autoSize,
      ...props
    }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
      autoSize?: boolean | { minRows?: number; maxRows?: number };
      children?: React.ReactNode;
    }) => React.createElement('textarea', props, children),
  },
  Message: {
    useMessage: () => [{ warning: mockWarning }, React.createElement('div', { 'data-testid': 'message-context' })],
  },
  Tag: ({ children, onClose }: { children: React.ReactNode; closable?: boolean; onClose?: () => void }) =>
    React.createElement(
      'div',
      {},
      React.createElement('span', {}, children),
      React.createElement(
        'button',
        {
          type: 'button',
          'aria-label': `remove-${String(children)}`,
          onClick: onClose,
        },
        'remove'
      )
    ),
}));

const renderControlledSendBox = (
  props: Partial<React.ComponentProps<typeof SendBox>> & { initialValue?: string } = {}
) => {
  const { initialValue = '', onSend = vi.fn().mockResolvedValue(undefined), onStop, ...restProps } = props;

  const Harness = () => {
    const [value, setValue] = React.useState(initialValue);
    return (
      <>
        <SendBox value={value} onChange={setValue} onSend={onSend} onStop={onStop} {...restProps} />
        <div data-testid='current-value'>{value}</div>
      </>
    );
  };

  return {
    ...render(<Harness />),
    onSend,
    onStop,
  };
};

const getTextarea = (): HTMLTextAreaElement => {
  const textarea = screen.getByRole('textbox');
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('Expected textarea');
  }
  return textarea;
};

describe('SendBox queue and interaction behaviors', () => {
  const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    layoutState = { isMobile: false };
    conversationState = { conversationId: 'conversation-1' };
    previewState = {
      domSnippets: [],
      setSendBoxHandler: mockSetSendBoxHandler,
      removeDomSnippet: mockRemoveDomSnippet,
      clearDomSnippets: mockClearDomSnippets,
    };
    dragUploadState = {
      isFileDragging: false,
      dragHandlers: {},
    };
    uploadState = { isUploading: false };
    slashControllerArgs = null;
    slashControllerState = {
      isOpen: false,
      filteredCommands: [],
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onSelectByIndex: vi.fn(),
      onKeyDown: vi.fn(),
    };
    pasteServiceArgs = null;
    mockShouldBlockMobileInputFocus.mockReturnValue(false);

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
    })) as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) => {
      window.clearTimeout(handle);
    }) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
    vi.useRealTimers();
  });

  it('registers the preview handler, appends snippet text, and cleans up on unmount', async () => {
    const { unmount } = renderControlledSendBox({ initialValue: 'base text' });

    expect(mockSetSendBoxHandler).toHaveBeenCalledTimes(1);
    const registeredHandler = mockSetSendBoxHandler.mock.calls[0]?.[0] as ((text: string) => void) | undefined;
    expect(registeredHandler).toBeTypeOf('function');

    await act(async () => {
      registeredHandler?.('new snippet');
    });

    expect(getTextarea().value).toBe('base text\n\nnew snippet');

    unmount();

    expect(mockSetSendBoxHandler).toHaveBeenLastCalledWith(null);
  });

  it('sends input with DOM snippets, clears draft state, and removes snippet tags', async () => {
    previewState.domSnippets = [
      { id: 'dom-1', tag: 'main', html: '<main>Hello</main>' },
      { id: 'dom-2', tag: 'aside', html: '<aside>World</aside>' },
    ];

    const onSend = vi.fn().mockResolvedValue(undefined);
    renderControlledSendBox({ initialValue: 'Inspect page', onSend });

    fireEvent.click(screen.getByRole('button', { name: 'remove-main' }));
    expect(mockRemoveDomSnippet).toHaveBeenCalledWith('dom-1');

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    expect(onSend).toHaveBeenCalledWith(
      expect.stringContaining('Inspect page\n\n---\nDOM Snippet (main):\n```html\n<main>Hello</main>\n```')
    );
    expect(onSend).toHaveBeenCalledWith(expect.stringContaining('DOM Snippet (aside):'));
    expect(mockClearDomSnippets).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('current-value')).toHaveTextContent('');
  });

  it('blocks Enter-submit while loading when queueing is not allowed', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderControlledSendBox({
      initialValue: 'queued text',
      loading: true,
      onSend,
    });

    fireEvent.keyDown(getTextarea(), { key: 'Enter' });

    expect(mockWarning).toHaveBeenCalledWith('messages.conversationInProgress');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows send and stop controls together when sending is allowed during loading', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn().mockResolvedValue(undefined);
    renderControlledSendBox({
      initialValue: 'continue anyway',
      loading: true,
      allowSendWhileLoading: true,
      onSend,
      onStop,
    });

    expect(screen.getByRole('button', { name: 'send' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'stop' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('continue anyway');
    });

    fireEvent.click(screen.getByRole('button', { name: 'stop' }));
    await waitFor(() => {
      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });

  it('disables sending while uploads are still in progress', () => {
    uploadState = { isUploading: true };

    renderControlledSendBox({
      initialValue: 'waiting for file upload',
    });

    expect(screen.getByRole('button', { name: 'send' })).toBeDisabled();
  });

  it('renders slash commands, forwards selection, and exposes merged builtin commands', async () => {
    slashControllerState = {
      ...slashControllerState,
      isOpen: true,
      filteredCommands: [
        { name: 'open', description: 'Add file' },
        { name: 'plan', description: 'Plan next step' },
      ],
    };

    renderControlledSendBox({
      slashCommands: [
        { name: 'open', description: 'Duplicate builtin', kind: 'builtin', source: 'custom' },
        { name: 'plan', description: 'Plan next step', kind: 'template', source: 'custom' },
      ],
      onSlashBuiltinCommand: vi.fn(),
    });

    expect(screen.getByTestId('slash-menu')).toBeInTheDocument();
    expect(screen.getByText('/open')).toBeInTheDocument();
    expect(screen.getByText('/plan')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText('/plan'));
    expect(slashControllerState.setActiveIndex).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByText('/plan'));
    expect(slashControllerState.onSelectByIndex).toHaveBeenCalledWith(1);

    expect(slashControllerArgs?.commands.map((command) => command.name)).toEqual(['open', 'export', 'plan']);
  });

  it('executes builtin slash actions and template selection through the controller callbacks', async () => {
    const onSlashBuiltinCommand = vi.fn();
    renderControlledSendBox({
      initialValue: 'draft command',
      slashCommands: [{ name: 'review', description: 'Review code', kind: 'template', source: 'custom' }],
      onSlashBuiltinCommand,
    });

    expect(slashControllerArgs).not.toBeNull();

    await act(async () => {
      slashControllerArgs?.onExecuteBuiltin('open');
    });

    expect(onSlashBuiltinCommand).toHaveBeenCalledWith('open');
    expect(screen.getByTestId('current-value')).toHaveTextContent('');

    await act(async () => {
      slashControllerArgs?.onSelectTemplate('review');
    });

    expect(getTextarea().value).toBe('/review ');
  });

  it('inserts pasted text at the current cursor position and restores selection', async () => {
    vi.useFakeTimers();

    renderControlledSendBox({ initialValue: 'HelloWorld' });

    const textarea = getTextarea();
    textarea.focus();
    textarea.setSelectionRange(5, 5);

    await act(async () => {
      pasteServiceArgs?.onTextPaste?.(' ');
    });

    expect(screen.getByTestId('current-value')).toHaveTextContent('Hello World');

    act(() => {
      vi.runAllTimers();
    });

    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(6);
  });

  it('falls back to replacing the draft when paste text arrives without an active textarea', async () => {
    renderControlledSendBox({ initialValue: 'Old draft' });

    const textarea = getTextarea();
    textarea.blur();
    document.body.focus();

    await act(async () => {
      pasteServiceArgs?.onTextPaste?.('Fresh draft');
    });

    expect(screen.getByTestId('current-value')).toHaveTextContent('Fresh draft');
  });

  it('keeps short text single-line and switches to multiline for newline or very long input', () => {
    const { rerender } = render(
      <SendBox value='tiny' onChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />
    );

    expect(getTextarea().style.height).toBe('20px');

    rerender(<SendBox value={'short\nline'} onChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />);
    expect(getTextarea().style.minHeight).toBe('80px');

    rerender(<SendBox value={'x'.repeat(810)} onChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />);
    expect(getTextarea().style.minHeight).toBe('80px');
  });

  it('blurs mobile autofocus on mount and rejects focus without explicit user intent', () => {
    vi.useFakeTimers();
    layoutState = { isMobile: true };

    renderControlledSendBox();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(mockBlurActiveElement).toHaveBeenCalledTimes(1);

    fireEvent.focus(getTextarea());

    expect(mockBlurActiveElement).toHaveBeenCalledTimes(2);
    expect(mockHandlePasteFocus).not.toHaveBeenCalled();
  });

  it('blocks mobile focus when the platform reports focus should be suppressed', () => {
    layoutState = { isMobile: true };
    mockShouldBlockMobileInputFocus.mockReturnValue(true);

    renderControlledSendBox();

    fireEvent.mouseDown(getTextarea());
    fireEvent.focus(getTextarea());

    expect(mockBlurActiveElement).toHaveBeenCalled();
    expect(mockHandlePasteFocus).not.toHaveBeenCalled();
  });

  it('accepts mobile focus after touch intent and warms the conversation once the debounce completes', () => {
    vi.useFakeTimers();
    layoutState = { isMobile: true };

    renderControlledSendBox();

    const textarea = getTextarea();
    fireEvent.touchStart(textarea);
    fireEvent.focus(textarea);

    expect(mockHandlePasteFocus).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockWarmupInvoke).toHaveBeenCalledWith({ conversation_id: 'conversation-1' });
  });
});
