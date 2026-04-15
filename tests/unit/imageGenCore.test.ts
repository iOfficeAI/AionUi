/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsModule from 'fs';
import * as path from 'path';
import { ClientFactory } from '../../src/common/api/ClientFactory';
import {
  safeJsonParse,
  isImageFile,
  isHttpUrl,
  getFileExtensionFromDataUrl,
  processImageUri,
  executeImageGeneration,
} from '../../src/common/chat/imageGenCore';

// ---------------------------------------------------------------------------
// safeJsonParse
// ---------------------------------------------------------------------------

describe('safeJsonParse', () => {
  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback');
  });

  it('returns fallback for non-string input', () => {
    expect(safeJsonParse(null as unknown as string, 42)).toBe(42);
  });

  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  it('parses a valid JSON array', () => {
    expect(safeJsonParse('["img1.png","img2.jpg"]', [])).toEqual(['img1.png', 'img2.jpg']);
  });

  it('repairs and parses single-quoted JSON using jsonrepair', () => {
    // jsonrepair handles trailing commas and other common issues
    const result = safeJsonParse('[1, 2, 3,]', null);
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns fallback for null/undefined input', () => {
    expect(safeJsonParse(undefined as unknown as string, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// isImageFile
// ---------------------------------------------------------------------------

describe('isImageFile', () => {
  it.each(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])('returns true for %s extension', (ext) => {
    expect(isImageFile(`/workspace/photo${ext}`)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isImageFile('/workspace/photo.PNG')).toBe(true);
    expect(isImageFile('/workspace/photo.JPG')).toBe(true);
  });

  it.each(['.ts', '.txt', '.json', '.mp4', ''])('returns false for %s extension', (ext) => {
    expect(isImageFile(`/workspace/file${ext}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHttpUrl
// ---------------------------------------------------------------------------

describe('isHttpUrl', () => {
  it('returns true for http:// URLs', () => {
    expect(isHttpUrl('http://example.com/img.png')).toBe(true);
  });

  it('returns true for https:// URLs', () => {
    expect(isHttpUrl('https://example.com/img.png')).toBe(true);
  });

  it('returns false for file paths', () => {
    expect(isHttpUrl('/abs/path/img.png')).toBe(false);
    expect(isHttpUrl('relative/img.png')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isHttpUrl('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getFileExtensionFromDataUrl
// ---------------------------------------------------------------------------

describe('getFileExtensionFromDataUrl', () => {
  it('extracts .png from image/png data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/png;base64,abc')).toBe('.png');
  });

  it('extracts .jpg from image/jpeg data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/jpeg;base64,abc')).toBe('.jpg');
  });

  it('extracts .gif from image/gif data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/gif;base64,abc')).toBe('.gif');
  });

  it('extracts .webp from image/webp data URL', () => {
    expect(getFileExtensionFromDataUrl('data:image/webp;base64,abc')).toBe('.webp');
  });

  it('returns default extension for unknown mime type', () => {
    const result = getFileExtensionFromDataUrl('data:image/unknown-format;base64,abc');
    expect(result).toMatch(/^\./);
  });

  it('returns default extension for non-data-URL string', () => {
    const result = getFileExtensionFromDataUrl('https://example.com/img.png');
    expect(result).toMatch(/^\./);
  });
});

// ---------------------------------------------------------------------------
// processImageUri — HTTP URLs (no fs access required)
// ---------------------------------------------------------------------------

describe('processImageUri — HTTP URLs', () => {
  it('returns image_url object for http URL without touching fs', async () => {
    const result = await processImageUri('http://example.com/photo.png', '/workspace');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'http://example.com/photo.png', detail: 'auto' },
    });
  });

  it('returns image_url object for https URL', async () => {
    const result = await processImageUri('https://cdn.example.com/img.jpg', '/workspace');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'https://cdn.example.com/img.jpg', detail: 'auto' },
    });
  });
});

// ---------------------------------------------------------------------------
// processImageUri — local file paths (with fs mocking)
// ---------------------------------------------------------------------------

describe('processImageUri — local file paths', () => {
  beforeEach(() => {
    vi.spyOn(fsModule.promises, 'access').mockResolvedValue(undefined);
    vi.spyOn(fsModule.promises, 'readFile').mockResolvedValue(Buffer.from('fake-image-data'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves relative path against workspaceDir and returns base64 image_url', async () => {
    const result = await processImageUri('photo.png', '/workspace');
    expect(result).not.toBeNull();
    expect(result?.type).toBe('image_url');
    expect(result?.image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(result?.image_url.detail).toBe('auto');
  });

  it('accepts absolute paths directly', async () => {
    const result = await processImageUri('/abs/path/photo.webp', '/workspace');
    expect(result).not.toBeNull();
    expect(result?.image_url.url).toMatch(/^data:image\/webp;base64,/);
  });

  it('strips leading @ from filename', async () => {
    const result = await processImageUri('@photo.png', '/workspace');
    expect(result).not.toBeNull();
    expect(result?.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('throws for unsupported file extension', async () => {
    await expect(processImageUri('document.txt', '/workspace')).rejects.toThrow('not a supported image type');
  });

  it('throws with searched paths when file not found', async () => {
    vi.spyOn(fsModule.promises, 'access').mockRejectedValue(new Error('ENOENT: no such file'));
    await expect(processImageUri('missing.png', '/workspace')).rejects.toThrow('Image file not found');
  });
});

// ---------------------------------------------------------------------------
// executeImageGeneration — signal pre-aborted
// ---------------------------------------------------------------------------

describe('executeImageGeneration — aborted signal', () => {
  it('returns cancelled result immediately when signal is pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await executeImageGeneration(
      { prompt: 'generate a cat' },
      { id: 'test', name: 'test', platform: 'openai', baseUrl: '', apiKey: 'k', useModel: 'model' },
      '/workspace',
      undefined,
      controller.signal
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('cancelled');
    expect(result.text).toContain('cancelled');
  });
});

describe('executeImageGeneration — inline base64 cleanup', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(fsModule.promises, 'writeFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strips inline base64 markdown from returned text after extracting and saving the image', async () => {
    const dataUrl = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
    const responseText = `Image generated successfully.\n\n![generated image](${dataUrl})`;
    const createChatCompletion = vi.fn().mockResolvedValue({
      id: 'resp-1',
      object: 'chat.completion',
      created: 1,
      model: 'model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: responseText,
          },
          finish_reason: 'stop',
        },
      ],
    });

    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({
      createChatCompletion,
    } as unknown as Awaited<ReturnType<typeof ClientFactory.createRotatingClient>>);

    const result = await executeImageGeneration(
      { prompt: 'generate a cat' },
      { id: 'test', name: 'test', platform: 'openai', baseUrl: '', apiKey: 'k', useModel: 'model' },
      '/workspace'
    );

    const expectedImagePath = path.join('/workspace', 'img-1700000000000.png');
    expect(result).toEqual({
      success: true,
      text: `Image generated successfully.\n\n[embedded image extracted]\n\nGenerated image saved to: ${expectedImagePath}`,
      imagePath: expectedImagePath,
      relativeImagePath: 'img-1700000000000.png',
    });
    expect(result.text).not.toContain(dataUrl);
    expect(fsModule.promises.writeFile).toHaveBeenCalledWith(expectedImagePath, Buffer.from('fake-image', 'utf-8'));
  });
});
