import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWarning = vi.fn();
const mockAsk = vi.fn();
const mockDismiss = vi.fn();
const mockBtwOverlay = vi.fn(() => React.createElement('div', {}, 'BtwOverlay'));
const mockBtwState = {
  answer: '',
  isLoading: false,
  isOpen: false,
  question: '',
};

const mockUseConversationContextSafe = vi.fn(() => ({ conversationId: 'conv-1' }));
const mockUseLayoutContext = vi.fn(() => ({ isMobile: false }));
const mockUseSlashCommandController = vi.fn(() => ({
  isOpen: false,
  filteredCommands: [],
  activeIndex: 0,
  setActiveIndex: vi.fn(),
  onSelectByIndex: vi.fn(),
  onKeyDown: vi.fn(() => false),
}));
const mockUsePreviewContext = vi.fn(() => ({
  setSendBoxHandler: vi.fn(),
  domSnippets: [],
  removeDomSnippet: vi.fn(),
  clearDomSnippets: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: { invoke: vi.fn().mockResolvedValue(undefined) },
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
  useInputFocusRing: () => ({
    activeBorderColor: '#000',
    inactiveBorderColor: '#ccc',
    activeShadow: '0 0 0 2px rgba(0,0,0,0.1)',
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

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({
    isFileDragging: false,
    dragHandlers: {},
  }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({
    onPaste: vi.fn(),
    onFocus: vi.fn(),
  }),
}));

vi.mock('@renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: (value: unknown) => ({ current: value }),
}));

vi.mock('@renderer/services/FileService', () => ({
  allSupportedExts: [],
}));

vi.mock('@renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@renderer/components/media/UploadProgressBar', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'UploadProgressBar'),
}));

vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'SlashCommandMenu'),
}));

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({
  __esModule: true,
  default: (props: unknown) => mockBtwOverlay(props),
}));

vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    ask: mockAsk,
    dismiss: mockDismiss,
    ...mockBtwState,
  }),
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: (args: unknown) => mockUseSlashCommandController(args),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
  shouldBlockMobileInputFocus: vi.fn(() => false),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ onClick, children, icon, ...props }: React.ComponentProps<'button'>) =>
    React.createElement('button', { onClick, ...props }, icon ?? children),
  Input: {
    TextArea: ({ onKeyDown, onChange, value, ...props }: React.ComponentProps<'textarea'> & { value?: string }) =>
      React.createElement('textarea', {
        onKeyDown,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
        value,
        ...props,
      }),
  },
  Message: {
    useMessage: () => [{ warning: mockWarning }, null],
  },
  Tag: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children),
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => React.createElement('span', {}, 'ArrowUp'),
  CloseSmall: () => React.createElement('span', {}, 'CloseSmall'),
}));

import SendBox from '@/renderer/components/chat/sendbox';

describe('SendBox /btw handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBtwState.answer = '';
    mockBtwState.isLoading = false;
    mockBtwState.isOpen = false;
    mockBtwState.question = '';
    mockUsePreviewContext.mockReturnValue({
      setSendBoxHandler: vi.fn(),
      domSnippets: [],
      removeDomSnippet: vi.fn(),
      clearDomSnippets: vi.fn(),
    });
    mockUseSlashCommandController.mockReturnValue({
      isOpen: false,
      filteredCommands: [],
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onSelectByIndex: vi.fn(),
      onKeyDown: vi.fn(() => false),
    });
  });

  it('routes /btw through side-question flow even while loading', () => {
    const onChange = vi.fn();
    const onSend = vi.fn();

    const { container } = render(
      <SendBox value='/btw what file did we use?' onChange={onChange} onSend={onSend} loading enableBtw />
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    fireEvent.keyDown(textarea!, { key: 'Enter' });

    expect(mockAsk).toHaveBeenCalledWith('what file did we use?');
    expect(onSend).not.toHaveBeenCalled();
    expect(mockWarning).not.toHaveBeenCalledWith('messages.conversationInProgress');
  });

  it('blocks /btw when attachments are pending', () => {
    const { container } = render(
      <SendBox value='/btw what file did we use?' onChange={vi.fn()} onSend={vi.fn()} hasPendingAttachments enableBtw />
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    fireEvent.keyDown(textarea!, { key: 'Enter' });

    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockWarning).toHaveBeenCalledWith('conversation.sideQuestion.attachmentsNotAllowed');
  });

  it('blocks a second /btw while one is already running', () => {
    mockBtwState.isLoading = true;
    mockBtwState.isOpen = true;
    mockBtwState.question = 'existing side question';

    const { container } = render(
      <SendBox value='/btw what file did we use?' onChange={vi.fn()} onSend={vi.fn()} loading enableBtw />
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    fireEvent.keyDown(textarea!, { key: 'Enter' });

    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockWarning).toHaveBeenCalledWith('conversation.sideQuestion.alreadyRunning');
  });

  it('passes parent task running state to the btw overlay', () => {
    const { rerender } = render(
      <SendBox value='/btw what file did we use?' onChange={vi.fn()} onSend={vi.fn()} loading enableBtw />
    );

    expect(mockBtwOverlay).toHaveBeenCalled();
    expect(mockBtwOverlay.mock.calls.at(-1)?.[0]).toMatchObject({
      parentTaskRunning: true,
    });

    rerender(
      <SendBox value='/btw what file did we use?' onChange={vi.fn()} onSend={vi.fn()} loading={false} enableBtw />
    );

    expect(mockBtwOverlay.mock.calls.at(-1)?.[0]).toMatchObject({
      parentTaskRunning: false,
    });
  });

  it('treats /btw as normal text when the feature is disabled', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <SendBox value='/btw what file did we use?' onChange={vi.fn()} onSend={onSend} loading={false} />
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();

    fireEvent.keyDown(textarea!, { key: 'Enter' });

    expect(mockAsk).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('/btw what file did we use?');
  });

  it('only registers the /btw slash command when enabled', () => {
    render(<SendBox value='/' onChange={vi.fn()} onSend={vi.fn()} enableBtw />);

    expect(mockUseSlashCommandController).toHaveBeenCalled();
    const enabledCommands = mockUseSlashCommandController.mock.calls.at(-1)?.[0]?.commands ?? [];
    expect(enabledCommands.some((command: { name: string }) => command.name === 'btw')).toBe(true);

    mockUseSlashCommandController.mockClear();

    render(<SendBox value='/' onChange={vi.fn()} onSend={vi.fn()} />);

    const disabledCommands = mockUseSlashCommandController.mock.calls.at(-1)?.[0]?.commands ?? [];
    expect(disabledCommands.some((command: { name: string }) => command.name === 'btw')).toBe(false);
  });
});
