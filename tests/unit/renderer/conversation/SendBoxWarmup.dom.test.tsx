import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SendBox from '@/renderer/components/chat/SendBox';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getWorkspaceFiles: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Input: {
    TextArea: ({ onChange, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <textarea
        {...props}
        onChange={(event) => {
          onChange?.(event);
        }}
      />
    ),
  },
  Message: {
    useMessage: () => [
      {
        warning: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
      },
      null,
    ],
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => <span>send-icon</span>,
  CloseSmall: () => null,
  Plus: () => null,
  Quote: () => null,
}));

vi.mock('@office-ai/platform', () => ({
  theme: {
    Color: {
      PrimaryColor: '#1677ff',
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/components/chat/AtFileMenu', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SlashCommandMenu', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@renderer/components/media/UploadProgressBar', () => ({ default: () => null }));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: '#1677ff',
    inactiveBorderColor: '#d9d9d9',
    activeShadow: 'none',
  }),
}));
vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    isLoading: false,
    ask: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: () => ({
    filteredCommands: [],
    selectedIndex: -1,
    isOpen: false,
    setSelectedIndex: vi.fn(),
    executeSelected: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: 'conv-1',
    workspace: '/tmp/workspace',
  }),
}));
vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: () => null,
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/utils/warmupConversation', () => ({
  warmupConversation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/renderer/utils/chat/getLastAssistantText', () => ({
  getLastAssistantText: () => '',
}));
vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
  shouldBlockMobileInputFocus: () => false,
}));
vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
  useAddEventListener: vi.fn(),
}));
vi.mock('@renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    compositionHandlers: {},
    isComposingState: false,
    createKeyDownHandler: (send: () => void) => (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') send();
    },
  }),
}));
vi.mock('@renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    isOpen: false,
    openExportFlow: vi.fn(),
  }),
}));
vi.mock('@renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({
    isFileDragging: false,
    dragHandlers: {},
  }),
}));
vi.mock('@renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: <T,>(value: T) => ({ current: value }),
}));
vi.mock('@renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({
    onPaste: vi.fn(),
    onFocus: vi.fn(),
  }),
}));
vi.mock('@renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));
vi.mock('@renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({
    isUploading: false,
  }),
}));
vi.mock('@renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));
vi.mock('@renderer/services/FileService', () => ({
  allSupportedExts: [],
}));
vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({
  appendSpeechTranscript: (current: string, transcript: string) => `${current}${transcript}`,
}));
vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', () => ({
  createChainedDispatch: () => ({
    dispatch: vi.fn(),
    reset: vi.fn(),
  }),
  useLiveTranscriptInsertion: () => ({
    handleLiveTranscript: vi.fn(),
  }),
}));
vi.mock('@/renderer/utils/chat/messageHistory', () => ({
  getConversationInputHistory: () => [],
  isCaretOnFirstLine: () => true,
}));

describe('SendBox warmup triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('does not warm up when the input remains focused', async () => {
    render(<SendBox value='' onChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.focus(screen.getByTestId('sendbox-input'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(warmupConversation).not.toHaveBeenCalled();
  });

  it('does not schedule warmup work when sending a draft', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<SendBox value='hello' onChange={vi.fn()} onSend={onSend} />);

    await act(async () => {
      screen.getByTestId('sendbox-send-btn').click();
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(onSend).toHaveBeenCalledWith('hello');
    expect(warmupConversation).not.toHaveBeenCalled();
  });
});
