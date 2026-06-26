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
import MessageText from '@/renderer/pages/conversation/Messages/components/MessageText';
import {
  LARGE_TEXT_PREVIEW_MAX_LENGTH,
  LARGE_TEXT_PREVIEW_THRESHOLD,
} from '@/renderer/pages/conversation/Preview/constants';

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

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
  },
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
    previewMocks.openPreview.mockClear();
    localFileLinkMocks.payload = {
      path: '/missing/report.xlsx',
      reference: undefined,
    };
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockReset();
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockReset();
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
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

  it('opens a missing-file preview when a local markdown link no longer exists', async () => {
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(null);
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
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('const value = 1;\n');

    renderMessageWithLocalLink('[app.ts](/workspace/demo/src/app.ts:42:7)');

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
          targetLine: 42,
          targetColumn: 7,
          truncated: false,
        }),
        { replace: true }
      );
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
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('const value = 1;\n');

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
          truncated: false,
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
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockResolvedValue('data:image/png;base64,abc123');

    renderMessageWithLocalLink('[chart.png](/workspace/demo/assets/chart.png)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'data:image/png;base64,abc123',
        'image',
        expect.objectContaining({
          file_name: 'chart.png',
          file_path: filePath,
          workspace: '/workspace/demo',
          language: 'png',
          editable: false,
        }),
        { replace: true }
      );
    });
    expect(ipcBridge.fs.readFile.invoke).not.toHaveBeenCalled();
  });

  it('opens large code local markdown links with truncated read content', async () => {
    const filePath = '/workspace/demo/logs/app.log';
    const content = 'a'.repeat(LARGE_TEXT_PREVIEW_THRESHOLD + 1);
    localFileLinkMocks.payload = { path: filePath, reference: undefined };
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(fileMetadata(filePath));
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue(content);

    renderMessageWithLocalLink('[app.log](/workspace/demo/logs/app.log)');

    fireEvent.click(screen.getByRole('button', { name: 'open local file' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH),
        'code',
        expect.objectContaining({
          file_name: 'app.log',
          file_path: filePath,
          truncated: true,
          editable: false,
        }),
        { replace: true }
      );
    });
  });
});
