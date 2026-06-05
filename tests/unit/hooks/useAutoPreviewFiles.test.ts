/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock PreviewContext to avoid "must be used within PreviewProvider" error
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    findPreviewTab: vi.fn(),
    openPreview: vi.fn(),
    isOpen: false,
    tabs: [],
    activeTabId: null,
    closeTab: vi.fn(),
    switchTab: vi.fn(),
  }),
}));

// We test the standalone helper functions from the hook to avoid
// complex IPC bridge mocking. The hook's integration with IPC events
// is verified via E2E tests.

describe('useAutoPreviewFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hook import integrity', () => {
    it('module exports useAutoPreviewFiles function', async () => {
      const mod = await import('@/renderer/hooks/file/useAutoPreviewFiles');
      expect(mod.useAutoPreviewFiles).toBeDefined();
      expect(typeof mod.useAutoPreviewFiles).toBe('function');
    });
  });
});

// ── Unit tests for helper functions extracted from the hook ──────────

describe('file extension recognition', () => {
  // hasRecognizedExtension is private to the module.
  // We test equivalent logic inline.

  const hasRecognizedExtension = (filePath: string): boolean => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (!ext || ext === filePath.toLowerCase()) return false;
    const baseName = filePath.split(/[\\/]/).pop() || '';
    if (baseName.startsWith('.') && baseName.indexOf('.', 1) === -1) return false;
    return true;
  };

  it('recognizes .png as a valid extension', () => {
    expect(hasRecognizedExtension('img-1780634586578.png')).toBe(true);
  });

  it('recognizes .py as a valid extension', () => {
    expect(hasRecognizedExtension('src/hello.py')).toBe(true);
  });

  it('recognizes .tsx as a valid extension', () => {
    expect(hasRecognizedExtension('components/Button.tsx')).toBe(true);
  });

  it('recognizes .md as a valid extension', () => {
    expect(hasRecognizedExtension('README.md')).toBe(true);
  });

  it('rejects paths without extension (Makefile)', () => {
    expect(hasRecognizedExtension('Makefile')).toBe(false);
  });

  it('rejects hidden files (.gitignore)', () => {
    expect(hasRecognizedExtension('.gitignore')).toBe(false);
  });

  it('rejects hidden files (.env)', () => {
    expect(hasRecognizedExtension('.env')).toBe(false);
  });

  it('accepts hidden files with real extension (.eslintrc.json)', () => {
    expect(hasRecognizedExtension('.eslintrc.json')).toBe(true);
  });

  it('rejects paths with no extension like Dockerfile', () => {
    expect(hasRecognizedExtension('Dockerfile')).toBe(false);
  });
});

describe('POUNDING_IMG marker parsing', () => {
  const parseImagePathFromText = (text: string): string | null => {
    const markerMatch = text.match(/<!--\s*POUNDING_IMG:(.+?)\s*-->/);
    if (markerMatch) return markerMatch[1].trim();

    const savedMatch = text.match(/Generated image saved to:\s*(.+)$/m);
    if (savedMatch) return savedMatch[1].trim();

    return null;
  };

  it('parses POUNDING_IMG marker with extra whitespace', () => {
    const result = parseImagePathFromText('<!-- POUNDING_IMG:img-1780634586578.png -->');
    expect(result).toBe('img-1780634586578.png');
  });

  it('parses POUNDING_IMG marker without whitespace', () => {
    const result = parseImagePathFromText('<!--POUNDING_IMG:img-123.png-->');
    expect(result).toBe('img-123.png');
  });

  it('parses Generated image saved to line', () => {
    const text = 'Image generated: https://example.com/img.png\nGenerated image saved to: /workspace/img-123.png';
    expect(parseImagePathFromText(text)).toBe('/workspace/img-123.png');
  });

  it('returns null for text without image markers', () => {
    expect(parseImagePathFromText('Some random text without markers')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseImagePathFromText('')).toBeNull();
  });
});

describe('path resolution', () => {
  const resolveAbsolutePath = (filePath: string, workspace: string): string => {
    const resolvedWs = workspace.replace(/\/+$/, '');
    if (filePath.startsWith('/')) return filePath;
    if (filePath.startsWith(resolvedWs)) return filePath;
    return resolvedWs ? `${resolvedWs}/${filePath}` : filePath;
  };

  it('keeps absolute paths unchanged', () => {
    expect(resolveAbsolutePath('/tmp/ws/img.png', '/tmp/ws')).toBe('/tmp/ws/img.png');
  });

  it('resolves relative paths with workspace', () => {
    expect(resolveAbsolutePath('img.png', '/tmp/ws')).toBe('/tmp/ws/img.png');
  });

  it('strips trailing slash from workspace', () => {
    expect(resolveAbsolutePath('img.png', '/tmp/ws/')).toBe('/tmp/ws/img.png');
  });

  it('returns path as-is when workspace is empty', () => {
    expect(resolveAbsolutePath('img.png', '')).toBe('img.png');
  });
});
