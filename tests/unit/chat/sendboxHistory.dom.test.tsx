import type { TMessage } from '@/common/chat/chatLib';
import SendBox from '@/renderer/components/chat/sendbox';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { MessageListProvider } from '@/renderer/pages/conversation/Messages/hooks';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWarmupInvoke = vi.fn().mockResolvedValue(undefined);
const mockSetSendBoxHandler = vi.fn();
const mockOnPasteFocus = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: (...args: unknown[]) => mockWarmupInvoke(...args),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'var(--color-border-2)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({
    isFileDragging: false,
    dragHandlers: {},
  }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({
    onPaste: vi.fn(),
    onFocus: mockOnPasteFocus,
  }),
}));

vi.mock('@renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: (value: unknown) => ({ current: value }),
}));

vi.mock('@renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@renderer/services/FileService', () => ({
  allSupportedExts: [],
}));

vi.mock('@/renderer/components/media/UploadProgressBar', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'UploadProgressBar'),
}));

vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'SpeechInputButton'),
}));

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'BtwOverlay'),
}));

vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    answer: '',
    ask: vi.fn(),
    dismiss: vi.fn(),
    isLoading: false,
    isOpen: false,
    question: '',
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: mockSetSendBoxHandler,
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: () => ({
    isOpen: false,
    filteredCommands: [],
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    onSelectByIndex: vi.fn(),
    onKeyDown: vi.fn(() => false),
  }),
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    compositionHandlers: {},
    createKeyDownHandler: (onEnterPress: () => void, onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean) => {
      return (event: React.KeyboardEvent) => {
        if (onKeyDownIntercept?.(event)) {
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onEnterPress();
        }
      };
    },
  }),
}));

vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    activeIndex: 0,
    closeExportFlow: vi.fn(),
    filename: '',
    handleKeyDown: vi.fn(() => false),
    isOpen: false,
    loading: false,
    menuItems: [],
    openExportFlow: vi.fn(),
    onSelectMenuItem: vi.fn(),
    pathPreview: '',
    setActiveIndex: vi.fn(),
    setFilename: vi.fn(),
    showMenu: vi.fn(),
    step: 'menu',
    submitFilename: vi.fn(),
  }),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
  shouldBlockMobileInputFocus: vi.fn(() => false),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en-US',
    },
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ onClick, children, icon, ...props }: React.ComponentProps<'button'>) =>
    React.createElement('button', { onClick, ...props }, icon ?? children),
  Input: {
    TextArea: ({
      onKeyDown,
      onChange,
      onFocus,
      onBlur,
      value,
      ...props
    }: React.ComponentProps<'textarea'> & { value?: string }) =>
      React.createElement('textarea', {
        onKeyDown,
        onFocus,
        onBlur,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
        value,
        ...props,
      }),
  },
  Message: {
    useMessage: () => [{ warning: vi.fn() }, null],
  },
  Tag: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children),
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => React.createElement('span', {}, 'ArrowUp'),
  CloseSmall: () => React.createElement('span', {}, 'CloseSmall'),
}));

function createUserMessage(id: string, content: string): TMessage {
  return {
    id,
    msg_id: id,
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    content: { content },
    createdAt: Date.now(),
  };
}

const historyMessages: TMessage[] = [
  createUserMessage('msg-1', 'older question'),
  createUserMessage('msg-2', 'newer question'),
];

const SendBoxHarness: React.FC<{ initialValue?: string; messages?: TMessage[] }> = ({
  initialValue = '',
  messages = historyMessages,
}) => {
  const [value, setValue] = useState(initialValue);

  return (
    <MessageListProvider value={messages}>
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace', type: 'gemini' }}>
        <SendBox value={value} onChange={setValue} onSend={vi.fn().mockResolvedValue(undefined)} />
      </ConversationProvider>
    </MessageListProvider>
  );
};

describe('SendBox history navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recalls older sent messages with ArrowUp and sends the selected entry with Enter', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    const ControlledHarness: React.FC = () => {
      const [value, setValue] = useState('');
      return (
        <MessageListProvider value={historyMessages}>
          <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace', type: 'gemini' }}>
            <SendBox value={value} onChange={setValue} onSend={onSend} />
          </ConversationProvider>
        </MessageListProvider>
      );
    };

    render(<ControlledHarness />);

    const textarea = screen.getByRole('textbox');

    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(textarea).toHaveValue('newer question');
    });

    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(textarea).toHaveValue('older question');
    });

    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('older question');
    });
  });

  it('restores the pre-navigation draft when moving back down to the latest position', async () => {
    render(<SendBoxHarness initialValue='draft in progress' />);

    const textarea = screen.getByRole('textbox');

    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(textarea).toHaveValue('newer question');
    });

    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(textarea).toHaveValue('draft in progress');
    });
  });

  it('keeps native multi-line navigation when the caret is not on the first line', () => {
    render(<SendBoxHarness initialValue={'line one\nline two'} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;

    fireEvent.keyDown(textarea, { key: 'ArrowUp' });

    expect(textarea).toHaveValue('line one\nline two');
  });
});
