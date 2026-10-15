/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  processImageUri,
  saveGeneratedImage,
  executeImageGeneration,
  isMinimaxImageProvider,
  resolveMinimaxImageRequestPath,
  buildMinimaxImageRequestBody,
  parseMinimaxImageResponse,
} from '@/common/chat/imageGenCore';

let cleanupDirs: string[] = [];

function createWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aionui-image-gen-test-'));
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
    const imgPath = createImageFile(ws, 'test.png');

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

describe('saveGeneratedImage', () => {
  it('should save an image to the workspace directory', async () => {
    const ws = createWorkspace();

    const filePath = await saveGeneratedImage(DATA_URL_PNG, ws);

    expect(filePath.startsWith(ws)).toBe(true);
    expect(filePath).toMatch(/img-\d+\.png$/);
  });

  it('should resolve a workspace directory with trailing dot segments', async () => {
    const ws = createWorkspace();
    const subDir = join(ws, 'sub');
    mkdirSync(subDir);
    const trickyDir = join(ws, 'sub', '..', 'sub', '.');

    const filePath = await saveGeneratedImage(DATA_URL_PNG, trickyDir);

    expect(filePath.startsWith(pathResolve(ws))).toBe(true);
  });
});

describe('executeImageGeneration', () => {
  it('should return error for a non-existent workspace directory', async () => {
    const result = await executeImageGeneration(
      { prompt: 'a cat' },
      { id: 'test', name: 'test', platform: 'openai', base_url: '', api_key: 'sk-test', use_model: 'dall-e-3' },
      '/nonexistent/workspace'
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain('not found');
  });

  it('should return error when workspace path is a file, not a directory', async () => {
    const ws = createWorkspace();
    const filePath = createImageFile(ws, 'not-a-dir.png');

    const result = await executeImageGeneration(
      { prompt: 'a cat' },
      { id: 'test', name: 'test', platform: 'openai', base_url: '', api_key: 'sk-test', use_model: 'dall-e-3' },
      filePath
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain('not a directory');
  });
});

describe('isMinimaxImageProvider', () => {
  it('detects image models on both regional hosts', () => {
    expect(isMinimaxImageProvider({ base_url: 'https://api.minimax.io/v1', use_model: 'image-01' })).toBe(true);
    expect(isMinimaxImageProvider({ base_url: 'https://api.minimaxi.com/v1', use_model: 'image-01-live' })).toBe(true);
  });

  it('recognises later models in the same family', () => {
    expect(isMinimaxImageProvider({ base_url: 'https://api.minimax.io/v1', use_model: 'image-02' })).toBe(true);
  });

  it('rejects chat models served by the same host', () => {
    expect(isMinimaxImageProvider({ base_url: 'https://api.minimax.io/v1', use_model: 'MiniMax-M2' })).toBe(false);
  });

  it('rejects an unrelated host even for a matching model name', () => {
    expect(isMinimaxImageProvider({ base_url: 'https://example.com/v1', use_model: 'image-01' })).toBe(false);
  });

  it('rejects a missing base url or model', () => {
    expect(isMinimaxImageProvider({ use_model: 'image-01' })).toBe(false);
    expect(isMinimaxImageProvider({ base_url: 'https://api.minimax.io/v1', use_model: '' })).toBe(false);
  });
});

describe('resolveMinimaxImageRequestPath', () => {
  it('drops the version segment when the base url already carries it', () => {
    expect(resolveMinimaxImageRequestPath('https://api.minimax.io/v1')).toBe('/image_generation');
    expect(resolveMinimaxImageRequestPath('https://api.minimax.io/v1/')).toBe('/image_generation');
  });

  it('keeps the versioned path when the base url has none', () => {
    expect(resolveMinimaxImageRequestPath('https://api.minimax.io')).toBe('/v1/image_generation');
    expect(resolveMinimaxImageRequestPath(undefined)).toBe('/v1/image_generation');
  });
});

describe('buildMinimaxImageRequestBody', () => {
  it('sends the required fields plus a single url-formatted image', () => {
    expect(buildMinimaxImageRequestBody('image-01', 'a cat')).toEqual({
      model: 'image-01',
      prompt: 'a cat',
      n: 1,
      response_format: 'url',
    });
  });
});

describe('parseMinimaxImageResponse', () => {
  it('extracts generated image urls', () => {
    const result = parseMinimaxImageResponse({
      data: { image_urls: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'] },
      metadata: { success_count: 2, failed_count: 0 },
      base_resp: { status_code: 0, status_msg: 'success' },
    });

    expect(result.imageUrls).toEqual(['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png']);
    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });

  it('reports api level failures that arrive with a 200 response', () => {
    expect(() =>
      parseMinimaxImageResponse({
        base_resp: { status_code: 1004, status_msg: 'invalid api key' },
      })
    ).toThrow(/1004: invalid api key/);
  });

  it('coerces metadata counts reported as strings', () => {
    const result = parseMinimaxImageResponse({
      data: { image_urls: ['https://cdn.example.com/a.png'] },
      metadata: { success_count: '1', failed_count: '0' },
      base_resp: { status_code: 0 },
    });

    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('returns no urls when the response carries none', () => {
    expect(parseMinimaxImageResponse({ data: { image_urls: [] }, base_resp: { status_code: 0 } }).imageUrls).toEqual(
      []
    );
    expect(parseMinimaxImageResponse({ base_resp: { status_code: 0 } }).imageUrls).toEqual([]);
  });

  it('ignores blank entries in the url list', () => {
    const result = parseMinimaxImageResponse({
      data: { image_urls: ['https://cdn.example.com/a.png', '', '   ', null, 7] },
      base_resp: { status_code: 0 },
    });

    expect(result.imageUrls).toEqual(['https://cdn.example.com/a.png']);
  });

  it('rejects a payload that is not an object', () => {
    expect(() => parseMinimaxImageResponse(null)).toThrow(/unexpected response/);
    expect(() => parseMinimaxImageResponse('nope')).toThrow(/unexpected response/);
  });
});
