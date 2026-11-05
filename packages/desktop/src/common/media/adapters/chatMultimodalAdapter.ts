/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Form B adapter — chat completions multimodal output.
 *
 * The model is called through the normal chat API; generated images come back
 * either on `message.images` or embedded in the markdown body. This is the
 * original (and previously only) image generation path, migrated from
 * common/chat/imageGenCore.ts with one behavioral fix: ALL returned images are
 * persisted now, not just the first one.
 */

import type OpenAI from 'openai';
import { ClientFactory, type RotatingClient } from '@/common/api/ClientFactory';
import type { UnifiedChatCompletionResponse } from '@/common/api/RotatingApiClient';
import {
  fileToBase64,
  getImageMimeType,
  processImageUri,
  resolveSafePath,
  saveBase64MediaAsset,
  type ImageContent,
} from '../mediaAssets';
import type { MediaAsset, MediaGenOutcome, MediaGenRequest, MediaProviderAdapter } from '../types';
import * as fs from 'fs';

const API_TIMEOUT_MS = 120000; // 2 minutes for image generation API calls

type ExtractedImage = { type: 'image_url'; image_url: { url: string } };

export class ChatMultimodalAdapter implements MediaProviderAdapter {
  readonly form = 'B' as const;

  async generate(req: MediaGenRequest): Promise<MediaGenOutcome> {
    const { prompt, inputUris, provider, workspaceDir, proxy, signal } = req;

    if (signal?.aborted) {
      return { success: false, assets: [], text: 'Image generation was cancelled.', error: 'cancelled' };
    }

    try {
      const hasImages = inputUris.length > 0;
      const enhancedPrompt = hasImages ? `Analyze/Edit image: ${prompt}` : `Generate image: ${prompt}`;

      const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: enhancedPrompt },
      ];

      if (hasImages) {
        const imageResults = await Promise.allSettled(inputUris.map((uri) => processImageUri(uri, workspaceDir)));

        const successful: ImageContent[] = [];
        const errors: string[] = [];

        imageResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            successful.push(result.value);
          } else {
            const error = result.status === 'rejected' ? result.reason : 'Unknown error';
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Image ${index + 1} (${inputUris[index]}): ${errorMessage}`);
          }
        });

        successful.forEach((imageContent) => contentParts.push(imageContent));

        if (successful.length === 0) {
          return {
            success: false,
            assets: [],
            text: `Error: Failed to process any images. Errors:\n${errors.join('\n')}`,
            error: errors.join('\n'),
          };
        }
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'user', content: contentParts }];

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
        return { success: false, assets: [], text: 'No response from image generation API', error: 'No response' };
      }

      const responseText = choice.message.content || 'Image generated successfully.';
      let images: ExtractedImage[] | undefined = choice.message.images;

      // Extract images from markdown in content if not in images field
      if ((!images || images.length === 0) && responseText) {
        images = await extractImagesFromMarkdown(responseText, workspaceDir);
      }

      if (!images || images.length === 0) {
        const warningMessage = `Image generation did not produce any images.\n\nModel response: ${responseText}\n\nTip: Make sure your image generation model supports this type of request. Current model: ${provider.use_model}`;
        return { success: true, assets: [], text: warningMessage };
      }

      // Persist every returned image (multi-image fix — the legacy path kept images[0] only).
      const assets: MediaAsset[] = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        if (image.type === 'image_url' && image.image_url?.url) {
          assets.push(await saveBase64MediaAsset('image', image.image_url.url, workspaceDir, i));
        }
      }

      if (assets.length === 0) {
        return { success: true, assets: [], text: responseText };
      }

      // Strip any inline base64 data URLs from the human-readable text before
      // returning. The images are already saved to disk and referenced by
      // path, so re-emitting hundreds of MB of base64 in the MCP tool response
      // just forces the parent process to ship that payload through framed TCP
      // again (which is where the 2026-04-14 commit-charge blow-up happened).
      const cleanText = responseText.replace(
        /!\[[^\]]*\]\(data:image\/[^;]+;base64,[^)]+\)/g,
        '[embedded image extracted]'
      );

      return { success: true, assets, text: cleanText };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, assets: [], text: 'Image generation was cancelled.', error: 'cancelled' };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MediaGen][FormB] API call failed:', error);
      return { success: false, assets: [], text: `Error generating image: ${errorMessage}`, error: errorMessage };
    }
  }
}

/** Pull data-URL or file-path markdown images out of the response body. */
async function extractImagesFromMarkdown(
  responseText: string,
  workspaceDir: string
): Promise<ExtractedImage[] | undefined> {
  const dataUrlRegex = /!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
  const dataUrlMatches = [...responseText.matchAll(dataUrlRegex)];
  if (dataUrlMatches.length > 0) {
    return dataUrlMatches.map((match) => ({
      type: 'image_url' as const,
      image_url: { url: match[1] },
    }));
  }

  const filePathRegex = /!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|gif|webp|bmp|tiff|svg))\)/gi;
  const filePathMatches = [...responseText.matchAll(filePathRegex)];
  if (filePathMatches.length === 0) return undefined;

  const processedImages: ExtractedImage[] = [];
  for (const match of filePathMatches) {
    const filePath = match[1];
    try {
      const fullPath = await resolveSafePath(workspaceDir, filePath);
      await fs.promises.access(fullPath);
      const base64Data = await fileToBase64(fullPath);
      const mimeType = getImageMimeType(fullPath);
      processedImages.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64Data}` },
      });
    } catch (_fileError) {
      console.warn(`[MediaGen][FormB] Could not load image file: ${filePath}`);
    }
  }
  return processedImages.length > 0 ? processedImages : undefined;
}
