/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownView from '@/renderer/components/Markdown';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { downloadFileFromPath } from '@/renderer/utils/file/download';

const copyTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getImageBase64Mock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const messageSuccessMock = vi.hoisted(() => vi.fn());
const messageErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getImageBase64: {
        invoke: (...args: unknown[]) => getImageBase64Mock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/components/Markdown/ShadowView', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/Markdown/CodeBlock', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <code>{children}</code>,
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: copyTextMock,
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
    success: (...args: unknown[]) => messageSuccessMock(...args),
    error: (...args: unknown[]) => messageErrorMock(...args),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
  Download: () => <span data-testid='download-icon' />,
  LoadingTwo: () => <span data-testid='loading-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('MarkdownView local file links', () => {
  beforeEach(() => {
    copyTextMock.mockClear();
    getImageBase64Mock.mockReset().mockResolvedValue(undefined);
    messageSuccessMock.mockClear();
    messageErrorMock.mockClear();
  });

  it('renders local file links as app controls instead of browser anchors', () => {
    const onLocalFileLink = vi.fn();

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'[report.xlsx](/C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/report.xlsx)'}
      </MarkdownView>
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'report.xlsx' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(
      'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/report.xlsx',
      expect.objectContaining({
        filePath: 'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/report.xlsx',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyTextMock).toHaveBeenCalledWith('C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/report.xlsx');
  });

  it('preserves Windows separators before punctuation in angle-wrapped local links', () => {
    const onLocalFileLink = vi.fn();

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'[generated.png](<C:\\Users\\admin\\.codex\\_cache\\-draft\\generated.png>)'}
      </MarkdownView>
    );

    fireEvent.click(screen.getByRole('button', { name: 'generated.png' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(
      'C:/Users/admin/.codex/_cache/-draft/generated.png',
      expect.objectContaining({
        filePath: 'C:/Users/admin/.codex/_cache/-draft/generated.png',
      })
    );
  });

  it('opens angle-wrapped Windows paths containing spaces and parentheses', () => {
    const onLocalFileLink = vi.fn();

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'[report.png](<C:\\Program Files (x86)\\.cache\\report.png>)'}
      </MarkdownView>
    );

    fireEvent.click(screen.getByRole('button', { name: 'report.png' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(
      'C:/Program Files (x86)/.cache/report.png',
      expect.objectContaining({
        filePath: 'C:/Program Files (x86)/.cache/report.png',
      })
    );
  });

  it('renders line references as file chips and copies the full reference', () => {
    const onLocalFileLink = vi.fn();

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'[2026-06-19.log](C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/2026-06-19.log:1421)'}
      </MarkdownView>
    );

    const fileButton = screen.getByRole('button', { name: /2026-06-19\.log\s+L1421/ });
    fireEvent.click(fileButton);

    expect(onLocalFileLink).toHaveBeenCalledWith(
      'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/2026-06-19.log',
      expect.objectContaining({
        filePath: 'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/2026-06-19.log',
        rawReference: 'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/2026-06-19.log:1421',
        line: 1421,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyTextMock).toHaveBeenCalledWith(
      'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/2026-06-19.log:1421'
    );
  });

  it('renders line and column references as file chips and copies the full reference', () => {
    const onLocalFileLink = vi.fn();

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'[app.log](C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/app.log:1421:7)'}
      </MarkdownView>
    );

    const fileButton = screen.getByRole('button', { name: /app\.log\s+L1421:7/ });
    fireEvent.click(fileButton);

    expect(onLocalFileLink).toHaveBeenCalledWith(
      'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/app.log',
      expect.objectContaining({
        filePath: 'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/app.log',
        rawReference: 'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/app.log:1421:7',
        line: 1421,
        column: 7,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyTextMock).toHaveBeenCalledWith(
      'C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/logs/app.log:1421:7'
    );
  });

  it('renders hash range references as file chips and copies normalized local references', () => {
    const onLocalFileLink = vi.fn();

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink}>
        {'[user.js 1-260行](/Users/demo/project/user.js#L1-L260)'}
      </MarkdownView>
    );

    expect(screen.queryByRole('link', { name: /user\.js/ })).not.toBeInTheDocument();

    const fileButton = screen.getByRole('button', { name: /user\.js 1-260行\s+L1-L260/ });
    fireEvent.click(fileButton);

    expect(onLocalFileLink).toHaveBeenCalledWith(
      '/Users/demo/project/user.js',
      expect.objectContaining({
        filePath: '/Users/demo/project/user.js',
        rawReference: '/Users/demo/project/user.js#L1-L260',
        line: 1,
        endLine: 260,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyTextMock).toHaveBeenCalledWith('/Users/demo/project/user.js#L1-L260');
  });

  it('does not render a no-op open button when no local file handler is provided', () => {
    render(
      <MarkdownView>{'[report.xlsx](/C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/report.xlsx)'}</MarkdownView>
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'report.xlsx' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyTextMock).toHaveBeenCalledWith('C:/Users/Administrator/AppData/Roaming/CSBU WorkMate/report.xlsx');
  });

  it('keeps ordinary http links as browser anchors', () => {
    render(<MarkdownView>{'[docs](https://csbu-workmate.com/docs)'}</MarkdownView>);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://csbu-workmate.com/docs');
  });

  it('keeps markdown link titles separate from destinations', () => {
    render(<MarkdownView>{'[docs](https://csbu-workmate.com/docs "Documentation")'}</MarkdownView>);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://csbu-workmate.com/docs');
    expect(link).toHaveAttribute('title', 'Documentation');
  });

  it('opens relative Grok artifact links through their absolute tool-output alias', () => {
    const onLocalFileLink = vi.fn();
    const generatedPath = 'C:\\Users\\test\\.grok\\sessions\\session-1\\images\\1.jpg';

    render(
      <MarkdownView
        onLocalFileLink={onLocalFileLink}
        localFileAliases={{ 'images/1.jpg': generatedPath }}
        localFileBasePath='C:\\Users\\test\\workspace'
      >
        {'[images/1.jpg](images/1.jpg)'}
      </MarkdownView>
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'images/1.jpg' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(generatedPath, expect.objectContaining({ filePath: generatedPath }));
  });

  it('preserves encoded Grok workspace directories when opening artifact links', () => {
    const onLocalFileLink = vi.fn();
    const generatedPath = String.raw`C:\Users\admin\.grok\sessions\C%3A%5CUsers%5Cadmin%5CWorkMate\session-1\images\1.jpg`;

    render(
      <MarkdownView onLocalFileLink={onLocalFileLink} localFileAliases={{ 'images/1.jpg': generatedPath }}>
        {'[images/1.jpg](images/1.jpg)'}
      </MarkdownView>
    );

    fireEvent.click(screen.getByRole('button', { name: 'images/1.jpg' }));
    expect(onLocalFileLink).toHaveBeenCalledWith(generatedPath, expect.objectContaining({ filePath: generatedPath }));
  });

  it('reads a Grok image alias through its artifact directory when it is outside the workspace', async () => {
    const generatedPath = 'C:\\Users\\test\\.grok\\sessions\\session-1\\images\\1.jpg';
    const workspace = 'C:\\Users\\test\\workspace';

    render(
      <LocalImageView.Provider value={{ root: workspace }}>
        <MarkdownView localFileAliases={{ 'images/1.jpg': generatedPath }}>{'![landscape](images/1.jpg)'}</MarkdownView>
      </LocalImageView.Provider>
    );

    expect(await screen.findByRole('img', { name: 'landscape' })).toHaveAttribute('src', generatedPath);
    expect(getImageBase64Mock).toHaveBeenCalledWith({
      path: generatedPath,
      workspace: 'C:\\Users\\test\\.grok\\sessions\\session-1\\images',
    });
  });

  it('preserves Windows separators in direct local image destinations', async () => {
    render(
      <MarkdownView>{'![landscape](C:\\Users\\admin\\.codex\\generated_images\\session\\generated.png)'}</MarkdownView>
    );

    expect(await screen.findByRole('img', { name: 'landscape' })).toHaveAttribute(
      'src',
      'C:/Users/admin/.codex/generated_images/session/generated.png'
    );
  });

  it('does not crash on malformed percent escapes in generated image links', async () => {
    render(<MarkdownView>{'![broken](images/bad%name.jpg)'}</MarkdownView>);

    expect(await screen.findByRole('img', { name: 'broken' })).toHaveAttribute('src', 'images/bad%name.jpg');
  });

  it('keeps http hash links as browser anchors', () => {
    render(<MarkdownView>{'[docs](https://csbu-workmate.com/docs#L10)'}</MarkdownView>);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://csbu-workmate.com/docs#L10');
  });

  it('adds empty alt text to external raw HTML images without alt text', () => {
    const { container } = render(
      <MarkdownView allowHtml>{'<img src="https://example.com/generated.png" />'}</MarkdownView>
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.com/generated.png');
    expect(image).toHaveAttribute('alt', '');
  });

  it('downloads a local markdown image from its resolved artifact path', async () => {
    const imagePath = String.raw`C:\Users\admin\.codex\generated_images\session-1\qr-code.png`;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qr-code');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    getImageBase64Mock.mockResolvedValue(`data:image/png;base64,${btoa('image-bytes')}`);

    render(<MarkdownView>{`![QR code](${imagePath})`}</MarkdownView>);
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    await waitFor(() => expect(messageSuccessMock).toHaveBeenCalledWith('acp.image.download_success'));
    expect(getImageBase64Mock).toHaveBeenLastCalledWith({
      path: 'C:/Users/admin/.codex/generated_images/session-1/qr-code.png',
      workspace: 'C:/Users/admin/.codex/generated_images/session-1',
    });
    expect(click).toHaveBeenCalledOnce();

    click.mockRestore();
    revokeObjectURL.mockRestore();
    createObjectURL.mockRestore();
  });

  it('downloads a remote markdown image with its URL file name', async () => {
    const imageBlob = new Blob(['image-bytes'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(imageBlob) });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:remote-qr-code');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let downloadedName = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloadedName = this.download;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarkdownView>{'![QR code](https://example.com/files/qr-code.png?token=secret)'}</MarkdownView>);
    const downloadButton = screen.getByLabelText('acp.image.download_aria');
    expect(downloadButton.className).toContain('markdown-image-download');
    fireEvent.click(downloadButton);

    await waitFor(() => expect(messageSuccessMock).toHaveBeenCalledWith('acp.image.download_success'));
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/files/qr-code.png?token=secret');
    expect(downloadedName).toBe('qr-code.png');

    vi.unstubAllGlobals();
    click.mockRestore();
    revokeObjectURL.mockRestore();
    createObjectURL.mockRestore();
  });

  it('shows a localized error when a markdown image cannot be downloaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getImageBase64Mock.mockRejectedValue(new Error('read denied'));

    render(<MarkdownView>{'![broken](/missing/image.png)'}</MarkdownView>);
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('acp.image.download_error'));
    expect(consoleError).toHaveBeenCalledWith('[MarkdownImage] Failed to download image:', expect.any(Error));

    consoleError.mockRestore();
  });
});

describe('local artifact downloads', () => {
  beforeEach(() => {
    getImageBase64Mock.mockReset();
  });

  it('downloads a Codex image through its artifact directory when it is outside the workspace', async () => {
    const imagePath = String.raw`C:\Users\admin\.codex\generated_images\session-1\image.png`;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:generated-image');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    getImageBase64Mock.mockResolvedValue(`data:image/png;base64,${btoa('image-bytes')}`);

    await downloadFileFromPath(imagePath, 'image.png');

    expect(getImageBase64Mock).toHaveBeenCalledWith({
      path: imagePath,
      workspace: String.raw`C:\Users\admin\.codex\generated_images\session-1`,
    });
    expect(click).toHaveBeenCalledOnce();

    click.mockRestore();
    revokeObjectURL.mockRestore();
    createObjectURL.mockRestore();
  });

  it('rejects without triggering a browser download when the backend returns no file data', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    getImageBase64Mock.mockResolvedValue(undefined);

    await expect(downloadFileFromPath('/missing/image.png', 'image.png')).rejects.toThrow('File data not found');
    expect(click).not.toHaveBeenCalled();

    click.mockRestore();
  });

  it('does not trigger a browser download when the backend rejects the read', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    getImageBase64Mock.mockRejectedValue(new Error('read denied'));

    await expect(downloadFileFromPath('/denied/image.png', 'image.png')).rejects.toThrow('read denied');
    expect(click).not.toHaveBeenCalled();

    click.mockRestore();
  });
});
