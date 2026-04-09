import SendBox from '@/renderer/components/chat/sendbox';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWarmupInvoke = vi.fn().mockResolvedValue(undefined);
const mockListWorkspaceFilesInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: (...args: unknown[]) => mockWarmupInvoke(...args),
      },
    },
    fs: {
      listWorkspaceFiles: {
        invoke: (...args: unknown[]) => mockListWorkspaceFilesInvoke(...args),
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
  useAddEventListener: vi.fn(),
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
    onFocus: vi.fn(),
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
    setSendBoxHandler: vi.fn(),
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
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
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
      onClick,
      onKeyUp,
      onSelect,
      value,
      ...props
    }: React.ComponentProps<'textarea'> & { value?: string }) =>
      React.createElement('textarea', {
        onKeyDown,
        onFocus,
        onBlur,
        onClick,
        onKeyUp,
        onSelect,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
        value,
        ...props,
      }),
  },
  Message: {
    useMessage: () => [{ warning: vi.fn() }, null],
  },
  Tag: ({
    children,
    closable,
    closeIcon,
    onClose,
  }: {
    children: React.ReactNode;
    closable?: boolean;
    closeIcon?: React.ReactNode;
    onClose?: () => void;
  }) =>
    React.createElement(
      'div',
      {},
      children,
      closable
        ? React.createElement(
            'button',
            {
              onClick: onClose,
              type: 'button',
            },
            closeIcon ?? 'close'
          )
        : null
    ),
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => React.createElement('span', {}, 'ArrowUp'),
  CloseSmall: () => React.createElement('span', {}, 'CloseSmall'),
  Quote: () => React.createElement('span', {}, 'Quote'),
}));

type SelectionItem = string | { path: string; name: string; isFile: boolean; relativePath?: string };

const SendBoxHarness: React.FC<{
  initialSelectedWorkspaceItems?: SelectionItem[];
}> = ({ initialSelectedWorkspaceItems = [] }) => {
  const [value, setValue] = useState('');
  const [selectedWorkspaceItems, setSelectedWorkspaceItems] = useState<SelectionItem[]>(initialSelectedWorkspaceItems);

  return (
    <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace', type: 'gemini' }}>
      <div>
        <div data-testid='selected-workspace-count'>{selectedWorkspaceItems.length}</div>
        <SendBox
          value={value}
          onChange={setValue}
          onSelectedWorkspaceItemsChange={setSelectedWorkspaceItems}
          onSend={vi.fn().mockResolvedValue(undefined)}
          selectedWorkspaceItems={selectedWorkspaceItems}
        />
      </div>
    </ConversationProvider>
  );
};

describe('SendBox @ file menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    mockListWorkspaceFilesInvoke.mockResolvedValue([
      {
        name: 'date.ts',
        fullPath: '/workspace/src/utils/date.ts',
        relativePath: 'src/utils/date.ts',
      },
      {
        name: 'My File.md',
        fullPath: '/workspace/docs/My File.md',
        relativePath: 'docs/My File.md',
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows matching files and inserts the selected relative path', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@date' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'e' });

    expect(await screen.findByText('date.ts')).toBeInTheDocument();
    expect(screen.getByText('src/utils/date.ts')).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(textarea).toHaveValue('@src/utils/date.ts');
    });
    expect(screen.getByTestId('sendbox-highlight-layer')).toHaveTextContent('@src/utils/date.ts');
    expect(screen.queryByRole('listbox', { name: 'File mentions' })).not.toBeInTheDocument();
  });

  it('keeps the highlight overlay aligned with the textarea text metrics', async () => {
    const originalGetComputedStyle = window.getComputedStyle.bind(window);
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => {
      const styles = originalGetComputedStyle(element);
      if (!(element instanceof HTMLTextAreaElement)) {
        return styles;
      }

      const overrides = {
        direction: 'rtl',
        fontFamily: '"Mock Sans"',
        fontSize: '16px',
        fontStyle: 'italic',
        fontWeight: '600',
        letterSpacing: '0.03em',
        lineHeight: '24px',
        paddingBottom: '6px',
        paddingLeft: '14px',
        paddingRight: '18px',
        paddingTop: '8px',
        tabSize: '6',
        textAlign: 'center',
        textIndent: '5px',
        textTransform: 'uppercase',
        wordSpacing: '0.2em',
      } satisfies Partial<CSSStyleDeclaration>;

      return new Proxy(styles, {
        get(target, property, receiver) {
          if (typeof property === 'string' && property in overrides) {
            return overrides[property as keyof typeof overrides];
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as CSSStyleDeclaration;
    });

    try {
      render(<SendBoxHarness />);

      const highlightLayer = screen.getByTestId('sendbox-highlight-layer');

      await waitFor(() => {
        expect(highlightLayer).toHaveStyle({
          direction: 'rtl',
          fontFamily: '"Mock Sans"',
          fontSize: '16px',
          fontStyle: 'italic',
          fontWeight: '600',
          letterSpacing: '0.03em',
          lineHeight: '24px',
          paddingBottom: '6px',
          paddingLeft: '14px',
          paddingRight: '18px',
          paddingTop: '8px',
          tabSize: '6',
          textAlign: 'center',
          textIndent: '5px',
          textTransform: 'uppercase',
          wordSpacing: '0.2em',
        });
      });
    } finally {
      getComputedStyleSpy.mockRestore();
    }
  });

  it('shows a search hint instead of dumping all files for bare @', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: '@' });

    expect(await screen.findByText('Type to search for files')).toBeInTheDocument();
    expect(screen.queryByText('date.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('My File.md')).not.toBeInTheDocument();
  });

  it('fetches workspace mentions only once during a single open @ session', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@d' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'd' });

    expect(await screen.findByText('date.ts')).toBeInTheDocument();
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: '@da' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'a' });

    fireEvent.change(textarea, { target: { value: '@dat' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 't' });

    await waitFor(() => {
      expect(screen.getByText('date.ts')).toBeInTheDocument();
    });
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledTimes(1);
  });

  it('escapes spaces in inserted paths', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@My' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'y' });

    expect(await screen.findByText('My File.md')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('My File.md'));

    await waitFor(() => {
      expect(textarea).toHaveValue('@docs/My\\ File.md');
    });
  });

  it('renders inline mention text and clears selected files when the mention is deleted', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@date' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'e' });

    expect(await screen.findByText('date.ts')).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('sendbox-highlight-layer')).toHaveTextContent('@src/utils/date.ts');
    });

    fireEvent.change(textarea, { target: { value: '' } });
    textarea.selectionStart = textarea.selectionEnd = 0;
    fireEvent.keyUp(textarea, { key: 'Backspace' });

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-count')).toHaveTextContent('0');
    });
  });

  it('shows and removes legacy string-backed file selections when no visible mention exists', async () => {
    render(<SendBoxHarness initialSelectedWorkspaceItems={['/workspace/README.md']} />);

    expect(await screen.findByText('README.md')).toBeInTheDocument();
    expect(screen.getByTestId('selected-workspace-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByText('CloseSmall'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-workspace-count')).toHaveTextContent('0');
    });
  });

  it('keeps object-backed add-to-chat selections when there is no visible mention text', async () => {
    render(
      <SendBoxHarness
        initialSelectedWorkspaceItems={[
          {
            path: '/workspace/src/utils/date.ts',
            name: 'date.ts',
            isFile: true,
            relativePath: 'src/utils/date.ts',
          },
        ]}
      />
    );

    expect(await screen.findByText('src/utils/date.ts')).toBeInTheDocument();
    expect(screen.getByTestId('selected-workspace-count')).toHaveTextContent('1');
  });

  it('keeps an existing add-to-chat selection when the same file is later removed from @ mentions', async () => {
    render(
      <SendBoxHarness
        initialSelectedWorkspaceItems={[
          {
            path: '/workspace/src/utils/date.ts',
            name: 'date.ts',
            isFile: true,
            relativePath: 'src/utils/date.ts',
          },
        ]}
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    expect(await screen.findByText('src/utils/date.ts')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: '@date' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'e' });

    expect(await screen.findByText('date.ts')).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(textarea).toHaveValue('@src/utils/date.ts');
    });

    fireEvent.change(textarea, { target: { value: '' } });
    textarea.selectionStart = textarea.selectionEnd = 0;
    fireEvent.keyUp(textarea, { key: 'Backspace' });

    await waitFor(() => {
      expect(screen.getByText('src/utils/date.ts')).toBeInTheDocument();
      expect(screen.getByTestId('selected-workspace-count')).toHaveTextContent('1');
    });
  });

  it('re-fetches workspace mention candidates for later @ searches in the same composer session', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@date' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'e' });

    expect(await screen.findByText('date.ts')).toBeInTheDocument();
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: '' } });
    textarea.selectionStart = textarea.selectionEnd = 0;
    fireEvent.keyUp(textarea, { key: 'Backspace' });

    mockListWorkspaceFilesInvoke.mockResolvedValueOnce([
      {
        name: 'NEW_GUIDE.md',
        fullPath: '/workspace/NEW_GUIDE.md',
        relativePath: 'NEW_GUIDE.md',
      },
    ]);

    fireEvent.change(textarea, { target: { value: '@NEW' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: 'W' });

    expect(await screen.findByRole('listbox', { name: 'File mentions' })).toBeInTheDocument();
    expect(screen.getAllByText('NEW_GUIDE.md').length).toBeGreaterThan(0);
    expect(mockListWorkspaceFilesInvoke).toHaveBeenCalledTimes(2);
  });
});
