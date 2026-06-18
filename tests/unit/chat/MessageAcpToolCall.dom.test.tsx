/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import MessageAcpToolCall from '@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall';

const mockDownloadFileFromPath = vi.fn().mockResolvedValue(undefined);
const mockMessageSuccess = vi.fn();
const mockMessageError = vi.fn();

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} data-testid='local-image' />
  ),
}));

vi.mock('@/renderer/utils/file/download', () => ({
  downloadFileFromPath: (...args: unknown[]) => mockDownloadFileFromPath(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick, ...props }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Message: {
    useMessage: () => [{ success: mockMessageSuccess, error: mockMessageError }, null],
  },
}));

vi.mock('@renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/FileChangesPanel', () => ({
  __esModule: true,
  default: () => <div data-testid='file-changes-panel' />,
}));

vi.mock('@/renderer/hooks/file/useDiffPreviewHandlers', () => ({
  useDiffPreviewHandlers: () => ({
    handleFileClick: vi.fn(),
    handleDiffClick: vi.fn(),
  }),
}));

vi.mock('@/renderer/utils/file/diffUtils', () => ({
  parseDiff: () => ({ fileName: 'file.ts' }),
}));

const createMessage = (update: IMessageAcpToolCall['content']['update']): IMessageAcpToolCall => ({
  id: 'msg-1',
  msg_id: 'msg-1',
  conversation_id: 'conv-1',
  type: 'acp_tool_call',
  content: {
    sessionId: 'sess-1',
    update,
  },
});

const baseUpdate: IMessageAcpToolCall['content']['update'] = {
  sessionUpdate: 'tool_call_update',
  tool_call_id: 'ig_test_image',
  status: 'completed',
  title: 'Image generation',
  kind: 'execute',
};

describe('MessageAcpToolCall image output', () => {
  beforeEach(() => {
    mockDownloadFileFromPath.mockReset();
    mockDownloadFileFromPath.mockResolvedValue(undefined);
    mockMessageSuccess.mockClear();
    mockMessageError.mockClear();
  });

  it('renders nothing when update content is missing', () => {
    const { container } = render(
      <MessageAcpToolCall
        message={
          {
            id: 'msg-empty',
            conversation_id: 'conv-1',
            type: 'acp_tool_call',
            content: undefined,
          } as unknown as IMessageAcpToolCall
        }
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the image path from rawOutput.image.path', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawOutput: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
        })}
      />
    );

    const image = screen.getByTestId('local-image');
    expect(image).toHaveAttribute('src', '/Users/test/.codex/generated_images/session/ig_test_image.png');
    expect(image).toHaveAttribute('alt', 'ig_test_image.png');
  });

  it('downloads the image from rawOutput.image.path', () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawOutput: {
            image: {
              path: imagePath,
            },
          },
        })}
      />
    );

    screen.getByLabelText('acp.image.download_aria').click();

    expect(mockDownloadFileFromPath).toHaveBeenCalledWith(imagePath, 'ig_test_image.png');
  });

  it('shows an error when image download fails', async () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDownloadFileFromPath.mockRejectedValueOnce(new Error('denied'));

    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawOutput: {
            image: {
              path: imagePath,
            },
          },
        })}
      />
    );

    screen.getByLabelText('acp.image.download_aria').click();

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('acp.image.download_error');
    });
    expect(consoleError).toHaveBeenCalledWith('[MessageAcpToolCall] Failed to download image:', expect.any(Error));
    expect(mockMessageSuccess).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('uses i18n keys for image download labels', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawOutput: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
        })}
      />
    );

    expect(screen.getByLabelText('acp.image.download_aria')).toBeInTheDocument();
  });

  it('falls back to raw_output.saved_path for persisted snake_case content', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          raw_output: {
            saved_path: '/Users/test/.codex/generated_images/session/ig_legacy.webp',
          },
        })}
      />
    );

    const image = screen.getByTestId('local-image');
    expect(image).toHaveAttribute('src', '/Users/test/.codex/generated_images/session/ig_legacy.webp');
    expect(image).toHaveAttribute('alt', 'ig_legacy.webp');
  });

  it('uses the generated image fallback alt when the path has no file name', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawOutput: {
            image: {
              path: '/',
            },
          },
        })}
      />
    );

    expect(screen.getByTestId('local-image')).toHaveAttribute('alt', 'acp.image.generated_alt');
  });

  it('renders kind fallback labels when title is missing', () => {
    const cases: Array<[IMessageAcpToolCall['content']['update']['kind'], string]> = [
      ['edit', 'File Edit'],
      ['read', 'File Read'],
      ['execute', 'Shell Command'],
      ['custom' as IMessageAcpToolCall['content']['update']['kind'], 'custom'],
    ];

    for (const [kind, label] of cases) {
      const { unmount } = render(
        <MessageAcpToolCall
          message={createMessage({
            ...baseUpdate,
            title: '',
            kind,
          })}
        />
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders status labels for pending and in-progress states', () => {
    const { rerender } = render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          status: 'pending',
        })}
      />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();

    rerender(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          status: 'in_progress',
        })}
      />
    );
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders raw input and content variants', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawInput: { prompt: '一只小猫' },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'done',
              },
            },
            {
              type: 'diff',
              path: '/workspace/file.ts',
              old_text: 'old',
              new_text: 'new',
            },
            {
              type: 'content',
              content: {
                type: 'text',
                text: '',
              },
            },
          ],
        })}
      />
    );

    expect(screen.getByText(/"prompt": "一只小猫"/)).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByTestId('file-changes-panel')).toBeInTheDocument();
  });

  it('renders string raw input as markdown', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          rawInput: 'echo hello',
        })}
      />
    );

    expect(screen.getByText(/echo hello/)).toBeInTheDocument();
  });

  it('renders an empty diff content with fallback file metadata', () => {
    render(
      <MessageAcpToolCall
        message={createMessage({
          ...baseUpdate,
          content: [
            {
              type: 'diff',
            },
          ],
        })}
      />
    );

    expect(screen.getByTestId('file-changes-panel')).toBeInTheDocument();
  });
});
