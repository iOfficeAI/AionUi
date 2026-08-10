/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  downloadUrlMediaAsset,
  fileToBase64,
  getFileExtensionFromDataUrl,
  getImageMimeType,
  getMediaMimeType,
  isVideoFile,
  processImageUri,
  resolveLocalInputPath,
  resolveSafePath,
  safeJsonParse,
  saveBase64MediaAsset,
} from '@/common/media/mediaAssets';

let cleanupDirs: string[] = [];

function createWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aionui-media-test-'));
  cleanupDirs.push(dir);
  return dir;
}

function createImageFile(dir: string, name: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, PNG_1x1);
  return filePath;
}

function createNonImageFile(dir: string, name: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, 'hello world');
  return filePath;
}

afterEach(() => {
  for (const d of cleanupDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  cleanupDirs = [];
});

// Minimal valid 1×1 PNG
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const DATA_URL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('processImageUri', () => {
  it('should return image_url for an HTTP URL without filesystem access', async () => {
    const result = await processImageUri('https://example.com/photo.png', '/nonexistent');

    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/photo.png', detail: 'auto' },
    });
  });

  it('should resolve a relative path within the workspace', async () => {
    const ws = createWorkspace();
    createImageFile(ws, 'test.png');

    const result = await processImageUri('test.png', ws);

    expect(result).toBeDefined();
    expect(result!.type).toBe('image_url');
    expect(result!.image_url.url).toContain('base64');
  });

  it('should resolve a path with @ prefix within the workspace', async () => {
    const ws = createWorkspace();
    createImageFile(ws, 'test.png');

    const result = await processImageUri('@test.png', ws);

    expect(result).toBeDefined();
    expect(result!.type).toBe('image_url');
  });

  it('should block path traversal via ../ from escaping the workspace', async () => {
    const ws = createWorkspace();

    await expect(processImageUri('../../../etc/passwd', ws)).rejects.toThrow('Path traversal blocked');
  });

  it('should block path traversal for ".." (parent without trailing path)', async () => {
    const ws = createWorkspace();
    // ".." triggers relative !== '..' short-circuit branch in isWithin
    await expect(processImageUri('..', ws)).rejects.toThrow('Path traversal blocked');
  });

  it('should block absolute path outside the workspace', async () => {
    const ws = createWorkspace();

    await expect(processImageUri('/etc/passwd', ws)).rejects.toThrow('Path traversal blocked');
  });

  it('should allow an absolute path that is inside the workspace', async () => {
    const ws = createWorkspace();
    const imgPath = createImageFile(ws, 'test.png');

    const result = await processImageUri(imgPath, ws);

    expect(result).toBeDefined();
    expect(result!.type).toBe('image_url');
  });

  it('should reject a non-image file even when within the workspace', async () => {
    const ws = createWorkspace();
    createNonImageFile(ws, 'notes.txt');

    await expect(processImageUri('notes.txt', ws)).rejects.toThrow('not a supported image type');
  });

  it('should resolve a "." path to the workspace directory itself', async () => {
    const ws = createWorkspace();
    // "." resolves to workspace dir — isWithin returns true via relative === '' branch
    await expect(processImageUri('.', ws)).rejects.toThrow('not a supported image type');
  });

  it('should resolve a path with dot segments within the workspace', async () => {
    const ws = createWorkspace();
    const subDir = join(ws, 'subdir');
    mkdirSync(subDir);
    createImageFile(subDir, 'image.png');

    const result = await processImageUri('subdir/../subdir/image.png', ws);

    expect(result).toBeDefined();
    expect(result!.type).toBe('image_url');
  });

  it('should reject a missing file within the workspace', async () => {
    const ws = createWorkspace();

    await expect(processImageUri('nonexistent.png', ws)).rejects.toThrow('Image file not found');
  });

  it('should block a symlink inside the workspace that points outside', async () => {
    const ws = createWorkspace();
    // Secret image lives outside the workspace; a symlink inside the workspace
    // points to it. The lexical containment check passes for the link path, but
    // realpath must reveal the escape and block the read.
    const outsideDir = createWorkspace();
    const secretImg = createImageFile(outsideDir, 'secret.png');
    symlinkSync(secretImg, join(ws, 'linked.png'));

    await expect(processImageUri('linked.png', ws)).rejects.toThrow('Path traversal blocked');
  });

  it('should block a symlinked directory inside the workspace that points outside', async () => {
    const ws = createWorkspace();
    const outsideDir = createWorkspace();
    createImageFile(outsideDir, 'secret.png');
    symlinkSync(outsideDir, join(ws, 'linked-dir'), 'dir');

    await expect(processImageUri('linked-dir/secret.png', ws)).rejects.toThrow('Path traversal blocked');
  });

  it('should allow a symlink inside the workspace that stays inside', async () => {
    const ws = createWorkspace();
    const imgPath = createImageFile(ws, 'real.png');
    symlinkSync(imgPath, join(ws, 'alias.png'));

    const result = await processImageUri('alias.png', ws);

    expect(result).toBeDefined();
    expect(result!.type).toBe('image_url');
  });
});

describe('saveBase64MediaAsset', () => {
  it('should save an image to the workspace directory', async () => {
    const ws = createWorkspace();

    const asset = await saveBase64MediaAsset('image', DATA_URL_PNG, ws);

    expect(asset.filePath.startsWith(ws)).toBe(true);
    expect(asset.filePath).toMatch(/img-\d+\.png$/);
  });

  it('should resolve a workspace directory with trailing dot segments', async () => {
    const ws = createWorkspace();
    const subDir = join(ws, 'sub');
    mkdirSync(subDir);
    const trickyDir = join(ws, 'sub', '..', 'sub', '.');

    const asset = await saveBase64MediaAsset('image', DATA_URL_PNG, trickyDir);

    expect(asset.filePath.startsWith(pathResolve(ws))).toBe(true);
  });

  it('falls back to the video default extension for a raw (non-data-URL) payload', async () => {
    const ws = createWorkspace();

    const asset = await saveBase64MediaAsset('video', Buffer.from(PNG_1x1).toString('base64'), ws);

    expect(asset.filePath).toMatch(/vid-\d+\.mp4$/);
  });

  it('wraps a write failure with a "Failed to save" error', async () => {
    const ws = createWorkspace();
    vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

    await expect(saveBase64MediaAsset('image', DATA_URL_PNG, ws)).rejects.toThrow('Failed to save image: disk full');
  });
});

describe('resolveLocalInputPath', () => {
  it('resolves a relative path against the workspace and strips an @ prefix', async () => {
    const ws = createWorkspace();
    createImageFile(ws, 'ref.png');

    // Compared against the realpath, not the literal join: the file exists,
    // so resolveSafePath canonicalizes it (that's the containment check
    // actually running), and CI temp dirs go through a symlink on macOS
    // (/var -> /private/var) or short-name normalization on Windows —
    // neither of which shows up in a plain path.join.
    const expected = await fs.promises.realpath(join(ws, 'ref.png'));
    await expect(resolveLocalInputPath('@ref.png', ws)).resolves.toBe(expected);
  });

  it('blocks a traversal attempt the same way processImageUri does', async () => {
    const ws = createWorkspace();

    await expect(resolveLocalInputPath('../../../../etc/passwd', ws)).rejects.toThrow('Path traversal blocked');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('["a","b"]', [])).toEqual(['a', 'b']);
  });

  it('falls back when input is empty or not a string', () => {
    expect(safeJsonParse('', ['fallback'])).toEqual(['fallback']);
    expect(safeJsonParse(undefined as unknown as string, ['fallback'])).toEqual(['fallback']);
  });

  it('repairs mildly malformed JSON before giving up', () => {
    // jsonrepair fixes trailing commas / single quotes; this is what makes
    // "close enough" model output usable instead of a hard failure.
    expect(safeJsonParse("['a','b',]", [])).toEqual(['a', 'b']);
  });

  it('falls back to the default when even repair cannot parse it', () => {
    expect(safeJsonParse('not json at all {{{', ['fallback'])).toEqual(['fallback']);
  });
});

describe('downloadUrlMediaAsset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('infers the extension from the content-type header', async () => {
    const ws = createWorkspace();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(Buffer.from(PNG_1x1), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      )
    );

    const asset = await downloadUrlMediaAsset('image', 'https://cdn.example.com/result', ws);

    expect(asset.filePath).toMatch(/\.png$/);
  });

  it('falls back to the URL extension when there is no usable content-type', async () => {
    const ws = createWorkspace();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.from(PNG_1x1), { status: 200, headers: {} })));

    const asset = await downloadUrlMediaAsset('image', 'https://cdn.example.com/result.png?sig=abc', ws);

    expect(asset.filePath).toMatch(/\.png$/);
  });

  it('falls back to the kind default extension when nothing else is available', async () => {
    const ws = createWorkspace();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.from(PNG_1x1), { status: 200, headers: {} })));

    const asset = await downloadUrlMediaAsset('image', 'https://cdn.example.com/result', ws);

    expect(asset.filePath).toMatch(/\.png$/);
  });

  it('throws when the download response is not ok', async () => {
    const ws = createWorkspace();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' })));

    await expect(downloadUrlMediaAsset('image', 'https://cdn.example.com/gone', ws)).rejects.toThrow(
      'Failed to download generated image: HTTP 404'
    );
  });

  it('infers the extension from a video content-type header', async () => {
    const ws = createWorkspace();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(Buffer.from(PNG_1x1), { status: 200, headers: { 'content-type': 'video/mp4' } })
        )
    );

    const asset = await downloadUrlMediaAsset('video', 'https://cdn.example.com/result', ws);

    expect(asset.filePath).toMatch(/\.mp4$/);
  });

  it('falls back to the video default extension when nothing else is available', async () => {
    const ws = createWorkspace();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.from(PNG_1x1), { status: 200, headers: {} })));

    const asset = await downloadUrlMediaAsset('video', 'https://cdn.example.com/result', ws);

    expect(asset.filePath).toMatch(/\.mp4$/);
  });

  it('wraps a write failure with a "Failed to save downloaded" error', async () => {
    const ws = createWorkspace();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(Buffer.from(PNG_1x1), { status: 200, headers: { 'content-type': 'image/png' } })
        )
    );
    vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

    await expect(downloadUrlMediaAsset('image', 'https://cdn.example.com/result', ws)).rejects.toThrow(
      'Failed to save downloaded image: disk full'
    );
  });
});

describe('isVideoFile', () => {
  it('recognizes known video extensions and rejects everything else', () => {
    expect(isVideoFile('clip.mp4')).toBe(true);
    expect(isVideoFile('clip.webm')).toBe(true);
    expect(isVideoFile('photo.png')).toBe(false);
  });
});

describe('getFileExtensionFromDataUrl', () => {
  it('maps a video data URL to a video extension', () => {
    expect(getFileExtensionFromDataUrl('data:video/webm;base64,AAAA')).toBe('.webm');
  });

  it('falls back to the default image extension for an unrecognized data URL', () => {
    expect(getFileExtensionFromDataUrl('not-a-data-url')).toBe('.png');
  });
});

describe('mime type helpers', () => {
  it('getImageMimeType falls back to the default image mime for an unknown extension', () => {
    expect(getImageMimeType('file.unknownext')).toBe('image/png');
  });

  it('getMediaMimeType resolves video extensions and falls back for unknown ones', () => {
    expect(getMediaMimeType('clip.mp4')).toBe('video/mp4');
    expect(getMediaMimeType('file.unknownext')).toBe('image/png');
  });
});

describe('fileToBase64', () => {
  it('wraps a non-ENOENT read failure as a generic read error', async () => {
    const ws = createWorkspace();
    const filePath = createImageFile(ws, 'locked.png');
    vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(new Error('EACCES: permission denied'));

    await expect(fileToBase64(filePath)).rejects.toThrow('Failed to read image file: EACCES: permission denied');
  });
});

describe('resolveSafePath', () => {
  it('rethrows a realpath failure that is not ENOENT', async () => {
    const ws = createWorkspace();
    createImageFile(ws, 'test.png');
    vi.spyOn(fs.promises, 'realpath').mockImplementation(async (target) => {
      if (String(target) === ws) return ws;
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });

    await expect(resolveSafePath(ws, 'test.png')).rejects.toThrow('EACCES: permission denied');
  });
});
