/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageText, {
  parseTeamContextResetNotice,
} from '@/renderer/pages/conversation/Messages/components/MessageText';
import { copyText } from '@/renderer/utils/ui/clipboard';

const previewMocks = vi.hoisted(() => ({
  openPreview: vi.fn(),
}));
const localFileLinkMocks = vi.hoisted(() => ({
  payload: {
    path: '/missing/report.xlsx',
    reference: undefined as
      | {
          filePath: string;
          rawReference: string;
          line?: number;
          column?: number;
          endLine?: number;
        }
      | undefined,
  },
}));
const mockFilePreview = vi.fn(({ path }: { path: string }) => <div data-testid='file-preview'>{path}</div>);

const forkMocks = vi.hoisted(() => ({
  fork: vi.fn(),
  ensureRuntime: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
      // ChatFileRef content endpoints — useLocalFilePreview reads by Local ref.
      getContentMetadata: { invoke: vi.fn() },
      readContent: { invoke: vi.fn() },
    },
    conversation: {
      fork: { invoke: forkMocks.fork },
      ensureRuntime: { invoke: forkMocks.ensureRuntime },
    },
  },
}));

// useForkConversation needs a router context; MessageText renders without one.
vi.mock('react-router-dom', () => ({
  useNavigate: () => forkMocks.navigate,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    openPreview: previewMocks.openPreview,
  }),
}));

vi.mock('@/renderer/components/chat/CollapsibleContent', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: (props: { path: string }) => mockFilePreview(props),
}));

vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({
    children,
    onLocalFileLink,
  }: {
    children?: React.ReactNode;
    onLocalFileLink?: (
      path: string,
      reference?: {
        filePath: string;
        rawReference: string;
        line?: number;
        column?: number;
        endLine?: number;
      }
    ) => void | Promise<void>;
  }) => (
    <div>
      {children}
      {onLocalFileLink && (
        <button
          type='button'
          onClick={() => void onLocalFileLink(localFileLinkMocks.payload.path, localFileLinkMocks.payload.reference)}
        >
          open local file
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/renderer/utils/chat/skillSuggestParser', () => ({
  hasSkillSuggest: () => false,
  stripSkillSuggest: (content: string) => content,
}));

vi.mock('@/renderer/utils/chat/thinkTagFilter', () => ({
  hasThinkTags: () => false,
  stripThinkTags: (content: string) => content,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/TeammateMessageAvatar', () => ({
  __esModule: true,
  default: ({ senderName }: { senderName?: string }) => <span data-testid='teammate-avatar'>{senderName}</span>,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: () => null,
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const fileMetadata = (path: string) => ({
  name: path.split(/[\\/]/).pop() || path,
  path,
  size: 128,
  type: 'file',
  lastModified: 1_717_000_000,
});

describe('MessageText attachment paths', () => {
  beforeEach(() => {
    mockFilePreview.mockClear();
    vi.mocked(copyText).mockClear();
    previewMocks.openPreview.mockClear();
    localFileLinkMocks.payload = {
      path: '/missing/report.xlsx',
      reference: undefined,
    };
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockReset();
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockReset();
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
    // Default: file exists (metadata resolves); tests that read set readContent.
    vi.mocked(ipcBridge.fs.getContentMetadata.invoke).mockReset().mockResolvedValue(fileMetadata('/x'));
    vi.mocked(ipcBridge.fs.readContent.invoke).mockReset().mockResolvedValue('');
  });

  const renderMessageWithLocalLink = (content = '[report](/missing/report.xlsx)') => {
    const message: IMessageText = {
      id: 'msg-local-link',
      msg_id: 'msg-local-link',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content,
      },
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );
  };

  const renderMessageText = (
    content: string,
    overrides: Partial<IMessageText> = {},
    contentOverrides: Partial<IMessageText['content']> = {}
  ) => {
    const message: IMessageText = {
      id: 'msg-marker',
      msg_id: 'msg-marker',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content,
        ...contentOverrides,
      },
      ...overrides,
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );
  };

  it('resolves relative attachment paths against the current workspace before previewing', () => {
    const message: IMessageText = {
      id: 'msg-1',
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'right',
      createdAt: Date.now(),
      content: {
        content: 'look at this\n\n[[AION_FILES]]\nuploads/photo.png',
      },
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    expect(screen.getByTestId('file-preview')).toHaveTextContent('/workspace/demo/uploads/photo.png');
  });

  it('lets text message content use the available row width on desktop', () => {
    const message: IMessageText = {
      id: 'msg-width',
      msg_id: 'msg-width',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content: 'wide content',
      },
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    const content = screen.getByTestId('message-text-content');
    expect(content.parentElement?.className).toContain('min-w-0');
    expect(content.parentElement?.className).not.toContain('max-w-780px');
  });

  it('wraps a long unbroken url/path in a user message so the bubble never overflows', () => {
    const longPath = '/var/folders/gd/6bb7q8jd1ll0g17q5gly4flw0000gn/T/aionui/0265f4a8/image-xxxxxxxxxxxxxxxxxx';

    renderMessageText(longPath, { position: 'right' });

    const content = screen.getByTestId('message-text-content');
    // overflow-wrap: anywhere breaks a no-space run by character AND shrinks
    // min-content, so the bubble stays within the row. break-words does neither.
    expect(content.className).toContain('[overflow-wrap:anywhere]');
    expect(content.className).not.toContain('break-words');
    expect(content).toHaveTextContent(longPath);
  });

  it('keeps absolute attachment paths unchanged before previewing', () => {
    const message: IMessageText = {
      id: 'msg-2',
      msg_id: 'msg-2',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'right',
      createdAt: Date.now(),
      content: {
        content: 'look at this\n\n[[AION_FILES]]\n/Users/demo/Desktop/photo.png',
      },
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    expect(screen.getByTestId('file-preview')).toHaveTextContent('/Users/demo/Desktop/photo.png');
  });

  it('previews valid user attachment paths with Windows, relative, spaces, and Chinese filenames', () => {
    const content = [
      'look at these',
      '',
      '[[AION_FILES]]',
      'C:\\Users\\demo\\Desktop\\图片 文件.png',
      'uploads/中文 文件.txt',
      '设计 图.png',
    ].join('\n');

    renderMessageText(content, { position: 'right' });

    const previews = screen.getAllByTestId('file-preview');
    expect(previews).toHaveLength(3);
    expect(previews[0]).toHaveTextContent('C:\\Users\\demo\\Desktop\\图片 文件.png');
    expect(previews[1]).toHaveTextContent('/workspace/demo/uploads/中文 文件.txt');
    expect(previews[2]).toHaveTextContent('/workspace/demo/设计 图.png');
    expect(screen.getByTestId('message-text-content')).toHaveTextContent('look at these');
  });

  it('renders assistant marker mentions as full message text without file previews', () => {
    const content = '请不要使用 [[AION_FILES]] 这种格式';

    renderMessageText(content);

    expect(screen.getByTestId('message-text-content')).toHaveTextContent(content);
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
    expect(mockFilePreview).not.toHaveBeenCalled();
    expect(ipcBridge.fs.getFileMetadata.invoke).not.toHaveBeenCalled();
  });

  it('keeps assistant marker-tail markdown visible as message text', () => {
    const content = [
      '不是用 `[[AION_FILES]]` 路径形式。',
      '',
      '[[AION_FILES]]',
      '## 怎么解决',
      '- 路径引用...模型看不到像素',
    ].join('\n');

    renderMessageText(content);

    const messageContent = screen.getByTestId('message-text-content');
    expect(messageContent).toHaveTextContent('不是用 `[[AION_FILES]]` 路径形式。');
    expect(messageContent).toHaveTextContent('[[AION_FILES]]');
    expect(messageContent).toHaveTextContent('## 怎么解决');
    expect(messageContent).toHaveTextContent('- 路径引用...模型看不到像素');
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
    expect(mockFilePreview).not.toHaveBeenCalled();
    expect(ipcBridge.fs.getFileMetadata.invoke).not.toHaveBeenCalled();
  });

  it('keeps assistant fenced-code marker text visible without file previews', () => {
    const content = ['```md', '[[AION_FILES]]', 'uploads/photo.png', '```'].join('\n');

    renderMessageText(content);

    const messageContent = screen.getByTestId('message-text-content');
    expect(messageContent).toHaveTextContent('```md');
    expect(messageContent).toHaveTextContent('[[AION_FILES]]');
    expect(messageContent).toHaveTextContent('uploads/photo.png');
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
    expect(mockFilePreview).not.toHaveBeenCalled();
    expect(ipcBridge.fs.getFileMetadata.invoke).not.toHaveBeenCalled();
  });

  it('keeps teammate marker text visible without file previews', () => {
    const content = '请不要使用 [[AION_FILES]] 这种格式';

    renderMessageText(
      content,
      {},
      {
        teammateMessage: true,
        senderName: 'Agent A',
        senderConversationId: 'agent-a',
      }
    );

    expect(screen.getByTestId('message-text-content')).toHaveTextContent(content);
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
    expect(mockFilePreview).not.toHaveBeenCalled();
    expect(ipcBridge.fs.getFileMetadata.invoke).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'markdown heading and list',
      tailLines: ['## 怎么解决', '- 路径引用...模型看不到像素'],
    },
    {
      name: 'code fence',
      tailLines: ['```md', 'uploads/photo.png', '```'],
    },
    {
      name: 'url',
      tailLines: ['https://example.com/photo.png'],
    },
  ])('keeps invalid user marker block text visible for $name', ({ tailLines }) => {
    const content = ['look', '', '[[AION_FILES]]', ...tailLines].join('\n');

    renderMessageText(content, { position: 'right' });

    const messageContent = screen.getByTestId('message-text-content');
    expect(messageContent).toHaveTextContent('look');
    expect(messageContent).toHaveTextContent('[[AION_FILES]]');
    for (const line of tailLines) {
      expect(messageContent).toHaveTextContent(line);
    }
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
    expect(mockFilePreview).not.toHaveBeenCalled();
    expect(ipcBridge.fs.getFileMetadata.invoke).not.toHaveBeenCalled();
  });

  it('copies complete assistant marker text', async () => {
    const content = '请不要使用 [[AION_FILES]] 这种格式';

    renderMessageText(content);

    const copyControl = screen.getByTestId('copy-icon').parentElement;
    expect(copyControl).not.toBeNull();
    fireEvent.click(copyControl as HTMLElement);

    await waitFor(() => {
      expect(copyText).toHaveBeenCalledWith(content);
    });
  });

  it('copies complete teammate marker text', async () => {
    const content = '请不要使用 [[AION_FILES]] 这种格式';

    renderMessageText(
      content,
      {},
      {
        teammateMessage: true,
        senderName: 'Agent A',
        senderConversationId: 'agent-a',
      }
    );

    const copyControl = screen.getByTestId('copy-icon').parentElement;
    expect(copyControl).not.toBeNull();
    fireEvent.click(copyControl as HTMLElement);

    await waitFor(() => {
      expect(copyText).toHaveBeenCalledWith(content);
    });
  });

  it('opens a missing-file preview when a local markdown link no longer exists', async () => {
    // Missing file: the content-metadata existence check rejects (backend 404).
    vi.mocked(ipcBridge.fs.getContentMetadata.invoke).mockRejectedValue(new Error('not found'));
    localFileLinkMocks.payload = {
      path: '/missing/report.xlsx',
      reference: {
        filePath: '/missing/report.xlsx',
        rawReference: '/missing/report.xlsx:10:2',
        line: 10,
        column: 2,
      },
    };

    renderMessageWithLocalLink();

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        '',
        'excel',
        expect.objectContaining({
          file_name: 'report.xlsx',
          file_path: '/missing/report.xlsx',
          missingFile: true,
          editable: false,
          targetLine: 10,
          targetColumn: 2,
        }),
        { replace: true }
      );
    });
  });

  it('opens an existing code local markdown link with read content and target location', async () => {
    const filePath = '/workspace/demo/src/app.ts';
    localFileLinkMocks.payload = {
      path: filePath,
      reference: {
        filePath,
        rawReference: `${filePath}:42:7`,
        line: 42,
        column: 7,
      },
    };
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('const value = 1;\n');

    renderMessageWithLocalLink('[app.ts](/workspace/demo/src/app.ts:42:7)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'const value = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'app.ts',
          fileRef: { kind: 'local', path: filePath },
          file_path: filePath,
          workspace: '/workspace/demo',
          language: 'ts',
          targetLine: 42,
          targetColumn: 7,
          oversized: false,
          lastModified: 1_717_000_000,
        }),
        { replace: true }
      );
    });
    // Content read by Local ChatFileRef over /content (utf8), not the legacy path endpoints.
    expect(ipcBridge.fs.readContent.invoke).toHaveBeenCalledWith({
      file: { kind: 'local', path: filePath },
      encoding: 'utf8',
    });
  });

  it('opens hash range local markdown links with only the start line in preview metadata', async () => {
    const filePath = '/workspace/demo/src/app.ts';
    localFileLinkMocks.payload = {
      path: filePath,
      reference: {
        filePath,
        rawReference: `${filePath}#L10-L20`,
        line: 10,
        endLine: 20,
      },
    };
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('const value = 1;\n');

    renderMessageWithLocalLink('[app.ts](/workspace/demo/src/app.ts#L10-L20)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'const value = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'app.ts',
          file_path: filePath,
          workspace: '/workspace/demo',
          language: 'ts',
          targetLine: 10,
          targetColumn: undefined,
          oversized: false,
          lastModified: 1_717_000_000,
        }),
        { replace: true }
      );
    });

    const metadata = previewMocks.openPreview.mock.calls[0]?.[2];
    expect(metadata).not.toHaveProperty('endLine');
    expect(metadata).not.toHaveProperty('targetEndLine');
  });

  it('opens office and pdf local markdown links without reading file content', async () => {
    const filePath = '/workspace/demo/reports/q2.pdf';
    localFileLinkMocks.payload = { path: filePath, reference: undefined };
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));

    renderMessageWithLocalLink('[q2.pdf](/workspace/demo/reports/q2.pdf)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        '',
        'pdf',
        expect.objectContaining({
          file_name: 'q2.pdf',
          file_path: filePath,
          workspace: '/workspace/demo',
          language: 'pdf',
        }),
        { replace: true }
      );
    });
    expect(ipcBridge.fs.readFile.invoke).not.toHaveBeenCalled();
    expect(ipcBridge.fs.getImageBase64.invoke).not.toHaveBeenCalled();
  });

  it('opens image local markdown links from base64 content without reading text content', async () => {
    const filePath = '/workspace/demo/assets/chart.png';
    localFileLinkMocks.payload = { path: filePath, reference: undefined };
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('data:image/png;base64,abc123');

    renderMessageWithLocalLink('[chart.png](/workspace/demo/assets/chart.png)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'data:image/png;base64,abc123',
        'image',
        expect.objectContaining({
          file_name: 'chart.png',
          fileRef: { kind: 'local', path: filePath },
          file_path: filePath,
          workspace: '/workspace/demo',
          language: 'png',
          editable: false,
        }),
        { replace: true }
      );
    });
    // Image read as a data URL over /content (dataurl encoding).
    expect(ipcBridge.fs.readContent.invoke).toHaveBeenCalledWith({
      file: { kind: 'local', path: filePath },
      encoding: 'dataurl',
    });
  });

  // Supersedes the old "truncated read content" case. Truncation is gone: an
  // oversized file is not read at all, because a partially read document reaching
  // a saveable editor is what destroyed the unread remainder on save.
  it('opens oversized local markdown links without reading content, read-only', async () => {
    const filePath = '/workspace/demo/logs/app.log';
    const oversize = 1024 * 1024 + 1;
    localFileLinkMocks.payload = { path: filePath, reference: undefined };
    vi.mocked(ipcBridge.fs.getContentMetadata.invoke).mockResolvedValue({
      name: 'app.log',
      path: filePath,
      size: oversize,
      type: 'file',
      lastModified: 1_717_000_000,
    });

    renderMessageWithLocalLink('[app.log](/workspace/demo/logs/app.log)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        '',
        'code',
        expect.objectContaining({
          file_name: 'app.log',
          file_path: filePath,
          oversized: true,
          sizeBytes: oversize,
          thresholdBytes: 1024 * 1024,
          editable: false,
        }),
        { replace: true }
      );
    });
    // The whole point: the content endpoint is never hit for an oversized file.
    expect(ipcBridge.fs.readContent.invoke).not.toHaveBeenCalled();
  });
});

describe('MessageText team system notices', () => {
  it('renders a context-reset notice through i18n instead of exposing the wire payload', () => {
    const content = JSON.stringify({
      kind: 'context_reset',
      member_name: 'Writer',
      runtime_status: 'ready',
    });
    render(
      <MessageText
        message={{
          id: 'notice-1',
          msg_id: 'notice-1',
          conversation_id: 'conv-1',
          type: 'text',
          position: 'left',
          createdAt: Date.now(),
          content: {
            content,
            teammateMessage: true,
            senderName: 'team_system',
          },
        }}
      />
    );

    expect(screen.getAllByText('team.systemNotice.sender')).toHaveLength(2);
    expect(screen.getByTestId('message-text-content')).toHaveTextContent('team.systemNotice.contextResetSuccess');
    expect(screen.queryByText(content)).not.toBeInTheDocument();
  });

  it('rejects malformed context-reset notice payloads', () => {
    expect(parseTeamContextResetNotice('{"kind":"context_reset","runtime_status":"ready"}')).toBeNull();
  });
});

describe('MessageText delivery status badge', () => {
  const statusMessage = (status?: IMessageText['status']): IMessageText => ({
    id: 'msg-status',
    msg_id: 'msg-status',
    conversation_id: 'conv-1',
    type: 'text',
    position: 'right',
    status,
    createdAt: Date.now(),
    content: {
      content: 'sent mid-turn',
    },
  });

  it('shows a pending-delivery badge on a user message the agent has not consumed yet', () => {
    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={statusMessage('pending')} />
      </ConversationProvider>
    );

    expect(screen.getByTestId('message-status-badge')).toHaveTextContent('Unread');
  });

  it('shows no badge once the agent has consumed the message', () => {
    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={statusMessage('finish')} />
      </ConversationProvider>
    );

    expect(screen.queryByTestId('message-status-badge')).not.toBeInTheDocument();
  });

  it('shows no badge for an assistant message even if status happens to be pending', () => {
    const message = { ...statusMessage('pending'), position: 'left' as const };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    expect(screen.queryByTestId('message-status-badge')).not.toBeInTheDocument();
  });
});

describe('MessageText fork entry point', () => {
  const forkMessage = (overrides: Partial<IMessageText> = {}): IMessageText => ({
    id: 'msg-fork-1',
    msg_id: 'msg-fork-1',
    conversation_id: 'conv-fork',
    type: 'text',
    position: 'left',
    createdAt: Date.now(),
    content: { content: 'assistant reply' },
    ...overrides,
  });

  const renderWithCapability = (
    capability: { at_turn: boolean } | undefined,
    props: { isLastMessage?: boolean; hasForkAnchor?: boolean } = {}
  ) => {
    render(
      <ConversationProvider
        value={{ conversation_id: 'conv-fork', workspace: '/workspace/demo', type: 'acp', forkCapability: capability }}
      >
        <MessageText message={forkMessage()} isLastMessage={props.isLastMessage} hasForkAnchor={props.hasForkAnchor} />
      </ConversationProvider>
    );
  };

  beforeEach(() => {
    forkMocks.fork.mockReset().mockResolvedValue({ id: 'conv-forked' });
    forkMocks.ensureRuntime.mockReset().mockResolvedValue(undefined);
    forkMocks.navigate.mockReset();
  });

  it('hides the fork button when the agent declares no capability', () => {
    renderWithCapability(undefined, { isLastMessage: true });
    expect(screen.queryByTestId('message-fork-button')).toBeNull();
  });

  it('shows the fork button on anchored mid-history messages for at_turn backends', () => {
    renderWithCapability({ at_turn: true }, { isLastMessage: false, hasForkAnchor: true });
    expect(screen.getByTestId('message-fork-button')).toBeInTheDocument();
  });

  it('hides the fork button on un-anchored legacy messages even for at_turn backends', () => {
    renderWithCapability({ at_turn: true }, { isLastMessage: false, hasForkAnchor: false });
    expect(screen.queryByTestId('message-fork-button')).toBeNull();
  });

  it('limits head-only backends to the last message', () => {
    renderWithCapability({ at_turn: false }, { isLastMessage: false });
    expect(screen.queryByTestId('message-fork-button')).toBeNull();
  });

  it('shows the fork button on the last message for head-only backends', () => {
    renderWithCapability({ at_turn: false }, { isLastMessage: true });
    expect(screen.getByTestId('message-fork-button')).toBeInTheDocument();
  });

  it('clicking fork calls the API, refreshes, navigates, and pre-warms the runtime', async () => {
    renderWithCapability({ at_turn: true }, { isLastMessage: false, hasForkAnchor: true });
    fireEvent.click(screen.getByTestId('message-fork-button'));
    await waitFor(() => {
      expect(forkMocks.fork).toHaveBeenCalledWith({ conversation_id: 'conv-fork', message_id: 'msg-fork-1' });
      expect(forkMocks.navigate).toHaveBeenCalledWith('/conversation/conv-forked');
      expect(forkMocks.ensureRuntime).toHaveBeenCalledWith({ conversation_id: 'conv-forked' });
    });
  });
});
