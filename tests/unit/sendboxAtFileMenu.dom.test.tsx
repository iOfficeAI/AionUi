import SendBox from '@/renderer/components/chat/sendbox';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWarmupInvoke = vi.fn().mockResolvedValue(undefined);
const mockListWorkspaceFilesInvoke = vi.fn();
const mockEmit = vi.fn();

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
    emit: (...args: unknown[]) => mockEmit(...args),
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
  Tag: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children),
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => React.createElement('span', {}, 'ArrowUp'),
  CloseSmall: () => React.createElement('span', {}, 'CloseSmall'),
  Quote: () => React.createElement('span', {}, 'Quote'),
}));

const SendBoxHarness: React.FC = () => {
  const [value, setValue] = useState('');

  return (
    <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace', type: 'gemini' }}>
      <SendBox value={value} onChange={setValue} onSend={vi.fn().mockResolvedValue(undefined)} />
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
    expect(mockEmit).toHaveBeenCalledWith('gemini.selected.file.append', [
      {
        path: '/workspace/src/utils/date.ts',
        name: 'date.ts',
        isFile: true,
        relativePath: 'src/utils/date.ts',
      },
    ]);
  });

  it('shows a search hint instead of dumping all files for bare @', async () => {
    render(<SendBoxHarness />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '@' } });
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    fireEvent.keyUp(textarea, { key: '@' });

    expect(await screen.findByText('Type to search files')).toBeInTheDocument();
    expect(screen.queryByText('date.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('My File.md')).not.toBeInTheDocument();
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
});
