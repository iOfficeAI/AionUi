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
import type { OpenAIChatCompletionParams } from '@/common/api/OpenAI2GeminiConverter';
import type { TProviderWithModel } from '@/common/config/storage';
import type { UnifiedChatCompletionResponse } from '@/common/api/RotatingApiClient';
import { IMAGE_EXTENSIONS, MIME_TYPE_MAP, MIME_TO_EXT_MAP, DEFAULT_IMAGE_EXTENSION } from '@/common/config/constants';
import { resolveImageGenerationApiMode } from '@/common/utils/imageModelAllowlist';

const API_TIMEOUT_MS = 180000; // High-quality image renders can take longer than ordinary chat calls
const MAX_IMAGE_DOWNLOAD_BYTES = 64 * 1024 * 1024;

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

async function downloadGeneratedImage(url: string, workspaceDir: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to download generated image: HTTP ${response.status} ${response.statusText}`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_DOWNLOAD_BYTES) {
    throw new Error(`Generated image exceeds the ${MAX_IMAGE_DOWNLOAD_BYTES / 1024 / 1024} MB download limit.`);
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
    throw new Error(`Generated image URL returned unsupported content type: ${contentType}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) {
    throw new Error(`Generated image exceeds the ${MAX_IMAGE_DOWNLOAD_BYTES / 1024 / 1024} MB download limit.`);
  }

  let fileExtension = contentType.startsWith('image/')
    ? MIME_TO_EXT_MAP[contentType.slice('image/'.length)]
    : undefined;
  if (!fileExtension) {
    const urlExtension = path.extname(new URL(url).pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(urlExtension as ImageExtension)) {
      fileExtension = urlExtension;
    }
  }

  const fileName = `img-${Date.now()}${fileExtension || DEFAULT_IMAGE_EXTENSION}`;
  const filePath = path.join(path.resolve(workspaceDir), fileName);
  await fs.promises.writeFile(filePath, imageBuffer);
  return filePath;
}

export async function saveGeneratedImage(
  imageSource: string,
  workspaceDir: string,
  signal?: AbortSignal
): Promise<string> {
  if (isHttpUrl(imageSource)) {
    return await downloadGeneratedImage(imageSource, workspaceDir, signal);
  }

  const timestamp = Date.now();
  const fileExtension = getFileExtensionFromDataUrl(imageSource);
  const file_name = `img-${timestamp}${fileExtension}`;
  const resolvedDir = path.resolve(workspaceDir);
  const file_path = path.join(resolvedDir, file_name);

  const base64WithoutPrefix = imageSource.replace(/^data:image\/[^;]+;base64,/, '');
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

type OpenAIImageClient = RotatingClient & Pick<OpenAIRotatingClient, 'createImage'>;
type ImageResultItem = { b64_json?: string; url?: string; revised_prompt?: string };

type ImagesApiResponse = OpenAI.Images.ImagesResponse & {
  images?: ImageResultItem[];
  output_format?: string;
};

function supportsOpenAIImagesApi(client: RotatingClient): client is OpenAIImageClient {
  return 'createImage' in client && typeof client.createImage === 'function';
}

function extractImageResultItems(response: ImagesApiResponse): ImageResultItem[] {
  if (Array.isArray(response.data) && response.data.length > 0) {
    return response.data;
  }
  return Array.isArray(response.images) ? response.images : [];
}

function isMicrosoftMaiProvider(provider: TProviderWithModel): boolean {
  const baseUrl = provider.base_url.toLowerCase();
  return (
    baseUrl.includes('services.ai.azure.com/mai/v1') ||
    (baseUrl.includes('services.ai.azure.com') && /^mai[-_/ ]?image/i.test(provider.use_model))
  );
}

function ensureVersionedImagesBaseUrl(provider: TProviderWithModel): string {
  const trimmed = provider.base_url.replace(/\/+$/, '');
  if (isMicrosoftMaiProvider(provider) && !/\/mai\/v1$/i.test(trimmed)) {
    return `${trimmed}/mai/v1`;
  }
  if (!trimmed || /\/v\d+(?:beta)?$/i.test(trimmed) || /\/openai\/deployments\//i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

async function executeOpenAIImagesGeneration(
  prompt: string,
  provider: TProviderWithModel,
  rotatingClient: RotatingClient,
  workspaceDir: string,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  if (!supportsOpenAIImagesApi(rotatingClient)) {
    return {
      success: false,
      text: `Model ${provider.use_model} requires an OpenAI-compatible Images API provider.`,
      error: 'OpenAI Images API is not available for the selected provider.',
    };
  }

  const generationParams: Record<string, unknown> = { model: provider.use_model, prompt };
  if (isMicrosoftMaiProvider(provider)) {
    generationParams.width = 1024;
    generationParams.height = 1024;
  }

  const response = (await rotatingClient.createImage(generationParams as unknown as OpenAI.Images.ImageGenerateParams, {
    signal,
    timeout: API_TIMEOUT_MS,
  })) as ImagesApiResponse;
  const image = extractImageResultItems(response)[0];
  if (!image?.b64_json && !image?.url) {
    return {
      success: false,
      text: 'Image generation API did not return image data or an image URL.',
      error: 'No image data returned.',
    };
  }

  let imagePath: string;
  if (image.b64_json) {
    const outputFormat = String(response.output_format || 'png');
    const mimeSubtype = outputFormat === 'jpg' ? 'jpeg' : outputFormat;
    imagePath = await saveGeneratedImage(`data:image/${mimeSubtype};base64,${image.b64_json}`, workspaceDir, signal);
  } else {
    imagePath = await saveGeneratedImage(image.url!, workspaceDir, signal);
  }
  const relativeImagePath = path.relative(workspaceDir, imagePath);
  const revisedPrompt = image.revised_prompt ? `\n\nRevised prompt: ${image.revised_prompt}` : '';

  return {
    success: true,
    text: `Image generated successfully.${revisedPrompt}\n\nGenerated image saved to: ${imagePath}`,
    imagePath,
    relativeImagePath,
  };
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
    const apiMode = resolveImageGenerationApiMode(provider, provider.use_model) || 'chat-completions';
    if (apiMode === 'openai-images' && hasImages) {
      return {
        success: false,
        text: `Image editing is not yet supported for ${provider.use_model}. Generate a new image without image_uris instead.`,
        error: 'OpenAI Images API editing is not implemented.',
      };
    }

    const clientOptions = {
      proxy,
      rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
      ...(apiMode === 'openai-images'
        ? {
            baseConfig: {
              baseURL: ensureVersionedImagesBaseUrl(provider),
              ...(isMicrosoftMaiProvider(provider) ? { defaultHeaders: { 'api-key': provider.api_key } } : {}),
            },
          }
        : {}),
    };
    const rotatingClient: RotatingClient = await ClientFactory.createRotatingClient(provider, clientOptions);

    if (apiMode === 'openai-images') {
      return await executeOpenAIImagesGeneration(params.prompt, provider, rotatingClient, resolvedWorkspaceDir, signal);
    }

    let enhancedPrompt: string;
    if (hasImages) {
      enhancedPrompt = `Analyze/Edit image: ${params.prompt}`;
    } else {
      enhancedPrompt = `Generate image: ${params.prompt}`;
    }

    const contentParts: Array<{ type: 'text'; text: string } | ImageContent> = [{ type: 'text', text: enhancedPrompt }];

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

    const messages = [{ role: 'user' as const, content: contentParts }];
    const completionParams: OpenAIChatCompletionParams &
      Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'modalities'> & {
        modalities?: Array<'image' | 'text'>;
      } = {
      model: provider.use_model,
      messages,
      ...(provider.base_url.toLowerCase().includes('openrouter.ai') ? { modalities: ['image', 'text'] } : {}),
    };
    const completion: UnifiedChatCompletionResponse = await rotatingClient.createChatCompletion(
      // OpenRouter extends OpenAI's modalities union with `image`; the OpenAI
      // SDK type only declares `text | audio`, although it forwards this field.
      completionParams as unknown as OpenAIChatCompletionParams &
        OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      {
        signal,
        timeout: API_TIMEOUT_MS,
      }
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
      const imagePath = await saveGeneratedImage(firstImage.image_url.url, resolvedWorkspaceDir, signal);
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
