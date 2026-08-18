/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const previewMocks = vi.hoisted(() => ({
  openPreview: vi.fn(),
}));
const copyTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      fetchRemoteImage: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
      // ChatFileRef content endpoints — local file links open via a Local ref.
      getContentMetadata: { invoke: vi.fn() },
      readContent: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  joinPath: (base: string, rel: string) => `${base}/${rel}`,
}));

vi.mock('@/renderer/hooks/chat/useAutoScroll', () => ({
  useAutoScroll: () => {},
}));

vi.mock('@/renderer/hooks/ui/useTextSelection', () => ({
  useTextSelection: () => ({ selectedText: '', selectionPosition: null, clearSelection: vi.fn() }),
}));

vi.mock('@/renderer/hooks/chat/useTypingAnimation', () => ({
  useTypingAnimation: ({ content }: { content: string }) => ({
    displayedContent: content,
    isAnimating: false,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: copyTextMock,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    openPreview: previewMocks.openPreview,
  }),
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor', () => ({
  default: () => <div data-testid='markdown-editor' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/renderers/SelectionToolbar', () => ({
  default: () => <div data-testid='selection-toolbar' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/hooks/useScrollSyncHelpers', () => ({
  useContainerScroll: vi.fn(),
  useContainerScrollTarget: vi.fn(),
}));

vi.mock('@/renderer/components/Markdown/MermaidBlock', () => ({
  default: () => <div data-testid='mermaid-block' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
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
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

import MarkdownViewer from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';
import { ipcBridge } from '@/common';

const fileMetadata = (path: string) => ({
  name: path.split(/[\\/]/).pop() || path,
  path,
  size: 128,
  type: 'file',
  lastModified: 1_717_000_000,
});

describe('MarkdownViewer', () => {
  beforeEach(() => {
    previewMocks.openPreview.mockClear();
    copyTextMock.mockClear();
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockReset();
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockReset();
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
    vi.mocked(ipcBridge.fs.fetchRemoteImage.invoke).mockReset();
    // Default: file exists (metadata resolves); tests that read set readContent.
    vi.mocked(ipcBridge.fs.getContentMetadata.invoke).mockReset().mockResolvedValue(fileMetadata('/x'));
    vi.mocked(ipcBridge.fs.readContent.invoke).mockReset().mockResolvedValue('');
  });

  it('renders markdown content in preview mode', () => {
    render(<MarkdownViewer content='# Hello World' />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders MarkdownEditor in source mode', () => {
    render(<MarkdownViewer content='# Test' viewMode='source' />);
    expect(screen.getByTestId('markdown-editor')).toBeInTheDocument();
  });

  it('hides toolbar when hideToolbar is true', () => {
    render(<MarkdownViewer content='# Test' hideToolbar />);
    expect(screen.queryByText('preview.preview')).not.toBeInTheDocument();
  });

  it('opens local file links in the preview panel instead of browser windows', async () => {
    const filePath = '/Users/demo/Desktop/chart.jpg';
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('data:image/jpeg;base64,abc123');

    render(<MarkdownViewer content={`[image](${filePath})`} file_path='/Users/demo/Desktop/test.md' />);

    expect(screen.queryByRole('link', { name: 'image' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'image' }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'data:image/jpeg;base64,abc123',
        'image',
        expect.objectContaining({
          file_name: 'chart.jpg',
          fileRef: { kind: 'local', path: filePath },
          file_path: filePath,
          language: 'jpg',
          editable: false,
        }),
        { replace: true }
      );
    });
    // Image link content read as a data URL over /content by Local ref.
    expect(ipcBridge.fs.readContent.invoke).toHaveBeenCalledWith({
      file: { kind: 'local', path: filePath },
      encoding: 'dataurl',
    });
  });

  it('opens hash range local file links at the start line in preview mode', async () => {
    const filePath = '/Users/demo/Desktop/app.ts';
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('const value = 1;\n');

    render(<MarkdownViewer content={`[app.ts](${filePath}#L10-L20)`} file_path='/Users/demo/Desktop/test.md' />);

    expect(screen.queryByRole('link', { name: /app\.ts/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /app\.ts\s+L10-L20/ }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'const value = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'app.ts',
          file_path: filePath,
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

  it('opens encoded file URL hash links in preview mode', async () => {
    const filePath = '/Users/demo/Desktop/My File.ts';
    vi.mocked(ipcBridge.fs.readContent.invoke).mockResolvedValue('const value = 1;\n');

    render(<MarkdownViewer content='[encoded file](file:///Users/demo/Desktop/My%20File.ts#L1)' />);

    expect(screen.queryByRole('link', { name: 'encoded file' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /encoded file\s+L1/ }));

    await waitFor(() => {
      expect(previewMocks.openPreview).toHaveBeenCalledWith(
        'const value = 1;\n',
        'code',
        expect.objectContaining({
          file_name: 'My File.ts',
          file_path: filePath,
          language: 'ts',
          targetLine: 1,
          targetColumn: undefined,
          oversized: false,
          lastModified: 1_717_000_000,
        }),
        { replace: true }
      );
    });
  });

  it('keeps remote links as browser anchors', () => {
    render(<MarkdownViewer content='[docs](https://aionui.com/docs)' />);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://aionui.com/docs');
  });

  it('sanitizes raw HTML in preview mode (drops <script>, keeps benign markup)', () => {
    const { container } = render(
      <MarkdownViewer content={'before<script>window.__xss = 1</script>after and <b>bold</b>'} />
    );
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.querySelector('b')?.textContent).toBe('bold');
  });

  it('renders math via KaTeX in preview mode', () => {
    const { container } = render(<MarkdownViewer content='inline $x + y = z$ done' />);
    expect(container.querySelectorAll('.katex')).toHaveLength(1);
  });

  it('continues rendering local image markdown inline', async () => {
    const filePath = '/Users/demo/Desktop/chart.jpg';
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockResolvedValue('data:image/jpeg;base64,abc123');

    render(<MarkdownViewer content={`![image](${filePath})`} file_path='/Users/demo/Desktop/test.md' />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'image' })).toHaveAttribute('src', 'data:image/jpeg;base64,abc123');
    });
    expect(previewMocks.openPreview).not.toHaveBeenCalled();
  });
});
