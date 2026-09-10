/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared image generation logic used by both:
 * - The built-in MCP server (imageGenServer.ts)
 * - The legacy Gemini-specific tool (img-gen.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonrepair } from 'jsonrepair';
import type OpenAI from 'openai';
import { ClientFactory, type RotatingClient } from '@/common/api/ClientFactory';
import type { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import type { TProviderWithModel } from '@/common/config/storage';
import type { UnifiedChatCompletionResponse } from '@/common/api/RotatingApiClient';
import {
  IMAGE_EXTENSIONS,
  MIME_TYPE_MAP,
  MIME_TO_EXT_MAP,
  DEFAULT_IMAGE_EXTENSION,
  MINIMAX_IMAGE_GENERATION_PATH,
  MINIMAX_IMAGE_MODELS,
  MINIMAX_IMAGE_MODEL_PREFIX,
} from '@/common/config/constants';
import { isMinimaxImageApiHost } from '@/common/utils/imageModelAllowlist';

const API_TIMEOUT_MS = 120000; // 2 minutes for image generation API calls

type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

// ===== Path Boundary Helpers =====

const isWithin = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

/**
 * Resolve `candidate` against `workspaceDir` and verify the result stays inside
 * the workspace. A lexical containment check always applies; when the target
 * exists, it is additionally canonicalized with `realpath` so symlinks inside
 * the workspace cannot escape to arbitrary files outside it. Missing targets
 * resolve lexically — the caller's existence check reports "not found".
 */
const resolveSafePath = async (workspaceDir: string, candidate: string): Promise<string> => {
  const resolved = path.resolve(workspaceDir, candidate);
  if (!isWithin(workspaceDir, resolved)) {
    throw new Error(`Path traversal blocked: "${candidate}" resolves outside workspace`);
  }

  const realWorkspaceDir = await fs.promises.realpath(workspaceDir);
  let realTarget: string;
  try {
    realTarget = await fs.promises.realpath(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved;
    }
    throw error;
  }
  if (!isWithin(realWorkspaceDir, realTarget)) {
    throw new Error(`Path traversal blocked: "${candidate}" resolves outside workspace`);
  }
  return realTarget;
};

// ===== Utility Functions =====

export function safeJsonParse<T = unknown>(jsonString: string, fallbackValue: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallbackValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (_error) {
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson) as T;
    } catch (_repairError) {
      console.warn('[ImageGen] JSON parse failed:', jsonString.substring(0, 50));
      return fallbackValue;
    }
  }
}

export function isImageFile(file_path: string): boolean {
  const ext = path.extname(file_path).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext as ImageExtension);
}

export function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

export async function fileToBase64(file_path: string): Promise<string> {
  try {
    const fileBuffer = await fs.promises.readFile(file_path);
    return fileBuffer.toString('base64');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
      throw new Error(`Image file not found: ${file_path}`, { cause: error });
    }
    throw new Error(`Failed to read image file: ${errorMessage}`, { cause: error });
  }
}

export function getImageMimeType(file_path: string): string {
  const ext = path.extname(file_path).toLowerCase();
  return MIME_TYPE_MAP[ext] || MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
}

export function getFileExtensionFromDataUrl(dataUrl: string): string {
  const mimeTypeMatch = dataUrl.match(/^data:image\/([^;]+);base64,/);
  if (mimeTypeMatch && mimeTypeMatch[1]) {
    const mimeType = mimeTypeMatch[1].toLowerCase();
    return MIME_TO_EXT_MAP[mimeType] || DEFAULT_IMAGE_EXTENSION;
  }
  return DEFAULT_IMAGE_EXTENSION;
}

export async function saveGeneratedImage(base64Data: string, workspaceDir: string): Promise<string> {
  const timestamp = Date.now();
  const fileExtension = getFileExtensionFromDataUrl(base64Data);
  const file_name = `img-${timestamp}${fileExtension}`;
  const resolvedDir = path.resolve(workspaceDir);
  const file_path = path.join(resolvedDir, file_name);

  const base64WithoutPrefix = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');

  try {
    await fs.promises.writeFile(file_path, imageBuffer);
    return file_path;
  } catch (error) {
    console.error('[ImageGen] Failed to save image file:', error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

// ===== Image Content Processing =====

interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail: 'auto' | 'low' | 'high';
  };
}

export async function processImageUri(imageUri: string, workspaceDir: string): Promise<ImageContent | null> {
  if (isHttpUrl(imageUri)) {
    return {
      type: 'image_url',
      image_url: { url: imageUri, detail: 'auto' },
    };
  }

  let processedUri = imageUri;
  if (imageUri.startsWith('@')) {
    processedUri = imageUri.substring(1);
  }

  const fullPath = await resolveSafePath(workspaceDir, processedUri);

  try {
    await fs.promises.access(fullPath, fs.constants.F_OK);

    if (!isImageFile(fullPath)) {
      throw new Error(`File is not a supported image type: ${fullPath}`);
    }

    const base64Data = await fileToBase64(fullPath);
    const mimeType = getImageMimeType(fullPath);
    return {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'auto' },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('Path traversal blocked') ||
      errorMessage.includes('Image file not found') ||
      errorMessage.includes('not a supported image type')
    ) {
      throw error;
    }

    const possiblePaths = [imageUri, path.resolve(workspaceDir, imageUri)].filter((p, i, arr) => arr.indexOf(p) === i);
    throw new Error(
      `Image file not found. Searched paths:\n${possiblePaths.map((p) => `- ${p}`).join('\n')}\n\nPlease ensure the image file exists and has a valid image extension (.jpg, .png, .gif, .webp, etc.)`,
      { cause: error }
    );
  }
}

// ===== MiniMax Image Generation =====

/**
 * MiniMax serves its image models from a dedicated `/v1/image_generation`
 * endpoint rather than returning images from chat completions, so the
 * chat-multimodal path below can never produce an image for those models — the
 * request either comes back as plain text or is rejected outright.
 *
 * The request carries the model and the prompt; the response returns the
 * generated images in `data.image_urls` and reports API-level failures through
 * `base_resp.status_code` instead of an HTTP error, so that field is checked
 * explicitly.
 */

interface MinimaxImageRequestBody {
  model: string;
  prompt: string;
  n: number;
  response_format: 'url';
}

export interface MinimaxImageResponse {
  imageUrls: string[];
  successCount?: number;
  failedCount?: number;
}

/** Only the first image is saved today, so a single image is requested. */
const MINIMAX_IMAGE_COUNT = 1;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/**
 * Whether `provider` is configured against the MiniMax image generation endpoint.
 * Both the host and the model have to match: the same host also serves chat
 * models, which must keep using the chat-completions path.
 */
export function isMinimaxImageProvider(provider: { base_url?: string; use_model?: string }): boolean {
  if (!isMinimaxImageApiHost(provider.base_url)) return false;
  const model = (provider.use_model || '').trim().toLowerCase();
  if (!model) return false;
  return (MINIMAX_IMAGE_MODELS as readonly string[]).includes(model) || model.startsWith(MINIMAX_IMAGE_MODEL_PREFIX);
}

/**
 * Endpoint path to request, relative to the provider's configured base URL.
 * Presets already end in the API version segment, so it is dropped here to avoid
 * requesting a doubled path.
 */
export function resolveMinimaxImageRequestPath(base_url?: string): string {
  const trimmed = (base_url || '').replace(/\/+$/, '');
  if (/\/v\d+$/i.test(trimmed)) {
    return MINIMAX_IMAGE_GENERATION_PATH.replace(/^\/v\d+/i, '');
  }
  return MINIMAX_IMAGE_GENERATION_PATH;
}

export function buildMinimaxImageRequestBody(model: string, prompt: string): MinimaxImageRequestBody {
  return {
    model,
    prompt,
    n: MINIMAX_IMAGE_COUNT,
    response_format: 'url',
  };
}

export function parseMinimaxImageResponse(payload: unknown): MinimaxImageResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Image generation API returned an unexpected response');
  }

  const body = payload as {
    data?: { image_urls?: unknown } | null;
    metadata?: { success_count?: unknown; failed_count?: unknown } | null;
    base_resp?: { status_code?: unknown; status_msg?: unknown } | null;
  };

  const statusCode = toFiniteNumber(body.base_resp?.status_code);
  if (statusCode !== undefined && statusCode !== 0) {
    const statusMessage = typeof body.base_resp?.status_msg === 'string' ? body.base_resp.status_msg.trim() : '';
    throw new Error(`Image generation API error ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`);
  }

  const rawImageUrls = body.data?.image_urls;
  const imageUrls = Array.isArray(rawImageUrls)
    ? rawImageUrls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
    : [];

  return {
    imageUrls,
    successCount: toFiniteNumber(body.metadata?.success_count),
    failedCount: toFiniteNumber(body.metadata?.failed_count),
  };
}

/**
 * Download a generated image and return it as a data URL so it can be handed to
 * `saveGeneratedImage`, which already owns the write path.
 */
async function fetchImageAsDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status}`);
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mimeType = contentType.startsWith('image/') ? contentType : MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
}

async function executeMinimaxImageGeneration(
  prompt: string,
  provider: TProviderWithModel,
  resolvedWorkspaceDir: string,
  proxy?: string,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  // Reuses the shared client so API key rotation and proxy settings keep applying;
  // only the request path and the response shape are specific to this endpoint.
  const rotatingClient = (await ClientFactory.createRotatingClient(provider, {
    proxy,
    rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
  })) as OpenAIRotatingClient;

  const requestPath = resolveMinimaxImageRequestPath(provider.base_url);
  const body = buildMinimaxImageRequestBody(provider.use_model, prompt);

  const payload = await rotatingClient.executeWithRetry((client) =>
    client.post<unknown>(requestPath, { body, signal, timeout: API_TIMEOUT_MS })
  );

  const { imageUrls, failedCount } = parseMinimaxImageResponse(payload);

  if (imageUrls.length === 0) {
    const failedSuffix = failedCount ? ` (${failedCount} failed)` : '';
    return {
      success: true,
      text: `Image generation did not produce any images${failedSuffix}.\n\nCurrent model: ${provider.use_model}`,
    };
  }

  // Returned links are short lived, so the image is pulled into the workspace
  // right away and only the saved path is handed back to the caller.
  const firstImage = imageUrls[0];
  const dataUrl = isHttpUrl(firstImage) ? await fetchImageAsDataUrl(firstImage, signal) : firstImage;
  const imagePath = await saveGeneratedImage(dataUrl, resolvedWorkspaceDir);

  return {
    success: true,
    text: `Image generated successfully.\n\nGenerated image saved to: ${imagePath}`,
    imagePath,
    relativeImagePath: path.relative(resolvedWorkspaceDir, imagePath),
  };
}

// ===== Core Execution =====

export interface ImageGenParams {
  prompt: string;
  image_uris?: string[] | string;
}

export interface ImageGenResult {
  success: boolean;
  text: string;
  imagePath?: string;
  relativeImagePath?: string;
  error?: string;
}

/**
 * Core image generation function shared between MCP server and Gemini tool.
 */
export async function executeImageGeneration(
  params: ImageGenParams,
  provider: TProviderWithModel,
  workspaceDir: string,
  proxy?: string,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  if (signal?.aborted) {
    return { success: false, text: 'Image generation was cancelled.', error: 'cancelled' };
  }

  // Resolve and validate workspaceDir once to prevent path traversal
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  // fs.realpath would reject if the directory does not exist, but we should
  // fail fast so the caller gets a clear error rather than a cascade.
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(resolvedWorkspaceDir);
  } catch {
    return {
      success: false,
      text: `Workspace directory not found: ${resolvedWorkspaceDir}`,
      error: `Workspace directory not found: ${resolvedWorkspaceDir}`,
    };
  }
  if (!stat.isDirectory()) {
    return {
      success: false,
      text: `Workspace path is not a directory: ${resolvedWorkspaceDir}`,
      error: `Workspace path is not a directory: ${resolvedWorkspaceDir}`,
    };
  }

  try {
    // Parse image URIs
    let imageUris: string[] = [];
    if (params.image_uris) {
      if (typeof params.image_uris === 'string') {
        const parsed = safeJsonParse<string[]>(params.image_uris, null);
        imageUris = Array.isArray(parsed) ? parsed : [params.image_uris];
      } else if (Array.isArray(params.image_uris)) {
        imageUris = params.image_uris;
      }
    }

    const hasImages = imageUris.length > 0;

    // Models behind a dedicated image generation endpoint cannot be driven through
    // chat completions, so text-to-image requests are routed to that endpoint.
    // Requests that carry input images stay on the existing path until the
    // image-to-image parameters are wired up.
    if (!hasImages && isMinimaxImageProvider(provider)) {
      return await executeMinimaxImageGeneration(params.prompt, provider, resolvedWorkspaceDir, proxy, signal);
    }

    let enhancedPrompt: string;
    if (hasImages) {
      enhancedPrompt = `Analyze/Edit image: ${params.prompt}`;
    } else {
      enhancedPrompt = `Generate image: ${params.prompt}`;
    }

    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: enhancedPrompt }];

    // Process image URIs
    if (hasImages) {
      const imageResults = await Promise.allSettled(imageUris.map((uri) => processImageUri(uri, resolvedWorkspaceDir)));

      const successful: ImageContent[] = [];
      const errors: string[] = [];

      imageResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successful.push(result.value);
        } else {
          const error = result.status === 'rejected' ? result.reason : 'Unknown error';
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Image ${index + 1} (${imageUris[index]}): ${errorMessage}`);
        }
      });

      successful.forEach((imageContent) => contentParts.push(imageContent));

      if (successful.length === 0) {
        return {
          success: false,
          text: `Error: Failed to process any images. Errors:\n${errors.join('\n')}`,
          error: errors.join('\n'),
        };
      }
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'user', content: contentParts }];

    // Create client and call API
    const rotatingClient: RotatingClient = await ClientFactory.createRotatingClient(provider, {
      proxy,
      rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
    });

    const completion: UnifiedChatCompletionResponse = await rotatingClient.createChatCompletion(
      { model: provider.use_model, messages: messages as any },
      { signal, timeout: API_TIMEOUT_MS }
    );

    const choice = completion.choices[0];
    if (!choice) {
      return { success: false, text: 'No response from image generation API', error: 'No response' };
    }

    const responseText = choice.message.content || 'Image generated successfully.';
    let images = choice.message.images;

    // Extract images from markdown in content if not in images field
    if ((!images || images.length === 0) && responseText) {
      const dataUrlRegex = /!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
      const dataUrlMatches = [...responseText.matchAll(dataUrlRegex)];
      if (dataUrlMatches.length > 0) {
        images = dataUrlMatches.map((match) => ({
          type: 'image_url' as const,
          image_url: { url: match[1] },
        }));
      } else {
        const file_pathRegex = /!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|gif|webp|bmp|tiff|svg))\)/gi;
        const file_pathMatches = [...responseText.matchAll(file_pathRegex)];
        if (file_pathMatches.length > 0) {
          const processedImages: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
          for (const match of file_pathMatches) {
            const file_path = match[1];
            try {
              const fullPath = await resolveSafePath(resolvedWorkspaceDir, file_path);
              await fs.promises.access(fullPath);
              const base64Data = await fileToBase64(fullPath);
              const mimeType = getImageMimeType(fullPath);
              processedImages.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Data}` },
              });
            } catch (_fileError) {
              console.warn(`[ImageGen] Could not load image file: ${file_path}`);
            }
          }
          if (processedImages.length > 0) {
            images = processedImages;
          }
        }
      }
    }

    if (!images || images.length === 0) {
      const warningMessage = `Image generation did not produce any images.\n\nModel response: ${responseText}\n\nTip: Make sure your image generation model supports this type of request. Current model: ${provider.use_model}`;
      return { success: true, text: warningMessage };
    }

    const firstImage = images[0];
    if (firstImage.type === 'image_url' && firstImage.image_url?.url) {
      const imagePath = await saveGeneratedImage(firstImage.image_url.url, resolvedWorkspaceDir);
      const relativeImagePath = path.relative(resolvedWorkspaceDir, imagePath);

      // Strip any inline base64 data URLs from the human-readable text before
      // returning. The image is already saved to disk and referenced by path,
      // so re-emitting hundreds of MB of base64 in the MCP tool response just
      // forces the parent process to ship that payload through framed TCP again
      // (which is where the 2026-04-14 commit-charge blow-up happened).
      const cleanText = responseText.replace(
        /!\[[^\]]*\]\(data:image\/[^;]+;base64,[^)]+\)/g,
        '[embedded image extracted]'
      );

      return {
        success: true,
        text: `${cleanText}\n\nGenerated image saved to: ${imagePath}`,
        imagePath,
        relativeImagePath,
      };
    }

    return { success: true, text: responseText };
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, text: 'Image generation was cancelled.', error: 'cancelled' };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ImageGen] API call failed:`, error);
    return { success: false, text: `Error generating image: ${errorMessage}`, error: errorMessage };
  }
}
