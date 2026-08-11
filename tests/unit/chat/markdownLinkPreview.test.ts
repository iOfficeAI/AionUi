import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFileMetadataMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const getImageBase64Mock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: {
        invoke: getFileMetadataMock,
      },
      readFile: {
        invoke: readFileMock,
      },
      getImageBase64: {
        invoke: getImageBase64Mock,
      },
    },
  },
}));

import {
  openMarkdownLinkPreview,
  resolveLocalMarkdownLinkPath,
  resolveMarkdownLinkFallbackHref,
} from '@/renderer/utils/file/markdownLinkPreview';

describe('markdownLinkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves local markdown links with line suffixes to previewable file paths', () => {
    expect(resolveLocalMarkdownLinkPath('/workspace/src/app.ts:12', { workspace: '/workspace' })).toBe(
      '/workspace/src/app.ts'
    );

    expect(resolveLocalMarkdownLinkPath('README.md:3', { baseDir: '/workspace/docs' })).toBe(
      '/workspace/docs/README.md'
    );
  });

  it('opens workspace files in the preview panel instead of treating them as browser links', async () => {
    getFileMetadataMock.mockResolvedValue({
      name: 'app.ts',
      path: '/workspace/src/app.ts',
      size: 18,
      type: 'file',
      lastModified: Date.now(),
      isDirectory: false,
    });
    readFileMock.mockResolvedValue('const answer = 42;\n');

    const openPreview = vi.fn();
    const handled = await openMarkdownLinkPreview({
      href: '/workspace/src/app.ts:12',
      workspace: '/workspace',
      openPreview,
    });

    expect(handled).toBe(true);
    expect(getFileMetadataMock).toHaveBeenCalledWith({ path: '/workspace/src/app.ts' });
    expect(readFileMock).toHaveBeenCalledWith({ path: '/workspace/src/app.ts' });
    expect(openPreview).toHaveBeenCalledWith(
      'const answer = 42;\n',
      'code',
      expect.objectContaining({
        fileName: 'app.ts',
        filePath: '/workspace/src/app.ts',
        workspace: '/workspace',
        editable: true,
        language: 'ts',
      })
    );
  });

  it('falls back cleanly for non-file links and preserves file:// fallback urls for local paths', async () => {
    const openPreview = vi.fn();

    await expect(
      openMarkdownLinkPreview({
        href: 'https://example.com/docs',
        workspace: '/workspace',
        openPreview,
      })
    ).resolves.toBe(false);

    expect(openPreview).not.toHaveBeenCalled();
    expect(
      resolveMarkdownLinkFallbackHref('/workspace/docs/todo.md:7', 'http://127.0.0.1/workspace/docs/todo.md', {
        workspace: '/workspace',
      })
    ).toBe('file:///workspace/docs/todo.md');
  });
});
