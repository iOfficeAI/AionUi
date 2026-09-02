/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
import { processImageUri, saveGeneratedImage, executeImageGeneration } from '@/common/chat/imageGenCore';
import { ClientFactory, type RotatingClient } from '@/common/api/ClientFactory';

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
  vi.restoreAllMocks();
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
  it('uses the OpenAI Images API for GPT Image 2 and saves returned base64 data', async () => {
    const ws = createWorkspace();
    const createImage = vi.fn().mockResolvedValue({
      created: 1,
      output_format: 'png',
      data: [{ b64_json: PNG_1x1.toString('base64') }],
    });
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({ createImage } as unknown as RotatingClient);

    const result = await executeImageGeneration(
      { prompt: 'a watercolor fox' },
      {
        id: 'openai',
        name: 'OpenAI',
        platform: 'openai',
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        use_model: 'gpt-image-2',
      },
      ws
    );

    expect(createImage).toHaveBeenCalledWith(
      { model: 'gpt-image-2', prompt: 'a watercolor fox' },
      expect.objectContaining({ timeout: 180000 })
    );
    expect(result.success).toBe(true);
    expect(result.imagePath).toMatch(/img-\d+\.png$/);
    expect(result.text).toContain('Generated image saved to:');
  });

  it('downloads URL results returned by OpenAI-compatible image providers', async () => {
    const ws = createWorkspace();
    const createImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://cdn.example.com/generated.png' }],
    });
    const download = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(PNG_1x1, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(PNG_1x1.byteLength) },
      })
    );
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({ createImage } as unknown as RotatingClient);

    const result = await executeImageGeneration(
      { prompt: 'a neon city' },
      {
        id: 'xai',
        name: 'xAI',
        platform: 'custom',
        base_url: 'https://api.x.ai/v1',
        api_key: 'xai-test',
        use_model: 'grok-imagine-image-2.0',
      },
      ws
    );

    expect(download).toHaveBeenCalledWith('https://cdn.example.com/generated.png', { signal: undefined });
    expect(result.success).toBe(true);
    expect(result.imagePath).toMatch(/img-\d+\.png$/);
  });

  it('accepts the images array response variant used by compatible gateways', async () => {
    const ws = createWorkspace();
    const createImage = vi.fn().mockResolvedValue({
      images: [{ b64_json: PNG_1x1.toString('base64') }],
    });
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({ createImage } as unknown as RotatingClient);

    const result = await executeImageGeneration(
      { prompt: 'editorial illustration' },
      {
        id: 'gateway',
        name: 'Images Gateway',
        platform: 'custom',
        base_url: 'https://images.example.com/v1',
        api_key: 'test-key',
        use_model: 'recraftv4_1_pro',
      },
      ws
    );

    expect(createImage).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.imagePath).toMatch(/img-\d+\.png$/);
  });

  it('uses Microsoft MAI endpoint authentication for custom deployment names', async () => {
    const ws = createWorkspace();
    const createImage = vi.fn().mockResolvedValue({ data: [{ b64_json: PNG_1x1.toString('base64') }] });
    const createClient = vi
      .spyOn(ClientFactory, 'createRotatingClient')
      .mockResolvedValue({ createImage } as unknown as RotatingClient);

    const result = await executeImageGeneration(
      { prompt: 'a studio product photo' },
      {
        id: 'mai',
        name: 'Microsoft Foundry',
        platform: 'custom',
        base_url: 'https://example.services.ai.azure.com/mai/v1',
        api_key: 'azure-test',
        use_model: 'production-image-deployment',
      },
      ws
    );

    expect(createClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        baseConfig: expect.objectContaining({
          baseURL: 'https://example.services.ai.azure.com/mai/v1',
          defaultHeaders: { 'api-key': 'azure-test' },
        }),
      })
    );
    expect(createImage).toHaveBeenCalledWith(expect.objectContaining({ width: 1024, height: 1024 }), expect.anything());
    expect(result.success).toBe(true);
  });

  it('rejects a generated image URL that returns non-image content', async () => {
    const ws = createWorkspace();
    const createImage = vi.fn().mockResolvedValue({ data: [{ url: 'https://cdn.example.com/error' }] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"expired"}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({ createImage } as unknown as RotatingClient);

    const result = await executeImageGeneration(
      { prompt: 'a neon city' },
      {
        id: 'xai',
        name: 'xAI',
        platform: 'custom',
        base_url: 'https://api.x.ai/v1',
        api_key: 'xai-test',
        use_model: 'grok-imagine-image-2.0',
      },
      ws
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('unsupported content type');
  });

  it('keeps nano-banana on the chat completion image route', async () => {
    const ws = createWorkspace();
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'done',
            images: [{ type: 'image_url', image_url: { url: DATA_URL_PNG } }],
          },
        },
      ],
    });
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({
      createChatCompletion,
    } as unknown as RotatingClient);

    const result = await executeImageGeneration(
      { prompt: 'a watercolor fox' },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        platform: 'custom',
        base_url: 'https://openrouter.ai/api/v1',
        api_key: 'sk-test',
        use_model: 'nano-banana',
      },
      ws
    );

    expect(createChatCompletion).toHaveBeenCalledOnce();
    expect(createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ modalities: ['image', 'text'] }),
      expect.objectContaining({ timeout: 180000 })
    );
    expect(result.success).toBe(true);
    expect(result.imagePath).toMatch(/img-\d+\.png$/);
  });

  it('returns a clear error when GPT Image 2 editing is requested', async () => {
    const ws = createWorkspace();
    createImageFile(ws, 'input.png');
    const createClient = vi.spyOn(ClientFactory, 'createRotatingClient');

    const result = await executeImageGeneration(
      { prompt: 'make it blue', image_uris: ['input.png'] },
      {
        id: 'openai',
        name: 'OpenAI',
        platform: 'openai',
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        use_model: 'gpt-image-2',
      },
      ws
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.text).toContain('Image editing is not yet supported');
  });

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
