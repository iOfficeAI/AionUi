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

const previewMocks = vi.hoisted(() => ({
  openPreview: vi.fn(),
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

vi.mock('@/renderer/pages/conversation/Preview', () => ({
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
    onLocalFileLink?: (path: string) => void | Promise<void>;
  }) => (
    <div>
      {children}
      {onLocalFileLink && (
        <button type='button' onClick={() => void onLocalFileLink('/missing/report.xlsx')}>
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
  getAgentLogo: () => null,
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

describe('MessageText attachment paths', () => {
  beforeEach(() => {
    previewMocks.openPreview.mockClear();
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockReset();
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockReset();
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
  });

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

    const message: IMessageText = {
      id: 'msg-4',
      msg_id: 'msg-4',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content: '[report](/missing/report.xlsx)',
      },
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

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
        }),
        { replace: true }
      );
    });
  });
});
