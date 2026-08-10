/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Form A adapter — synchronous OpenAI-style images API.
 *
 * Covers `POST {base}/images/generations` (text-to-image) and
 * `POST {base}/images/edits` (image-to-image, when the spec declares
 * imageInput). Works for OpenAI (DALL·E, gpt-image-1) and the wide field of
 * OpenAI-compatible gateways (SiliconFlow, new-api/one-api, Azure OpenAI,
 * Ark Seedream, Zhipu CogView...).
 *
 * Response handling accepts both canonical `data[]` items (`b64_json` | `url`)
 * and the `images[]` variant some gateways use.
 */

import type OpenAI from 'openai';
import { toFile } from 'openai';
import { ClientFactory } from '@/common/api/ClientFactory';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import { downloadUrlMediaAsset, isHttpUrl, resolveLocalInputPath, saveBase64MediaAsset } from '../mediaAssets';
import type { MediaAsset, MediaGenOutcome, MediaGenRequest, MediaProviderAdapter } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const API_TIMEOUT_MS = 180000; // 3 minutes — gpt-image-1 hi-quality can be slow

type ImageResultItem = { b64_json?: string; url?: string };

export class OpenAiImagesAdapter implements MediaProviderAdapter {
  readonly form = 'A' as const;

  async generate(req: MediaGenRequest): Promise<MediaGenOutcome> {
    const { prompt, params, inputUris, provider, workspaceDir, proxy, signal, spec } = req;

    if (signal?.aborted) {
      return { success: false, assets: [], text: 'Image generation was cancelled.', error: 'cancelled' };
    }

    try {
      const client = await ClientFactory.createRotatingClient(provider, {
        proxy,
        rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
      });

      if (!(client instanceof OpenAIRotatingClient)) {
        return {
          success: false,
          assets: [],
          text: `Error: model "${provider.use_model}" resolved to the images API, but provider platform "${provider.platform}" does not speak the OpenAI protocol.`,
          error: 'incompatible-provider',
        };
      }

      const requestParams: Record<string, unknown> = {
        model: provider.use_model,
        prompt,
        n: params.n ?? 1,
      };
      if (params.size) requestParams.size = params.size;
      if (params.quality) requestParams.quality = params.quality;
      // Gateway extensions beyond the OpenAI schema — harmless for providers
      // that ignore unknown fields, essential for SD/Flux-style gateways.
      if (params.seed !== undefined) requestParams.seed = params.seed;
      if (params.negativePrompt) requestParams.negative_prompt = params.negativePrompt;

      req.onProgress?.({ stage: 'running' });

      let response: OpenAI.Images.ImagesResponse;
      if (inputUris.length > 0 && spec?.params.imageInput) {
        const imageFiles = await Promise.all(
          inputUris
            .filter((uri) => !isHttpUrl(uri))
            .map(async (uri) => {
              const fullPath = await resolveLocalInputPath(uri, workspaceDir);
              await fs.promises.access(fullPath, fs.constants.F_OK);
              return toFile(fs.createReadStream(fullPath), path.basename(fullPath));
            })
        );
        if (imageFiles.length === 0) {
          return {
            success: false,
            assets: [],
            text: 'Error: image editing via the images API requires local image files (HTTP URLs are not supported by this endpoint). Download the image to the workspace first.',
            error: 'no-local-input',
          };
        }
        response = await client.createImageEdit(
          {
            ...requestParams,
            image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
          } as unknown as OpenAI.Images.ImageEditParams,
          { signal, timeout: API_TIMEOUT_MS }
        );
      } else {
        response = await client.createImage(requestParams as unknown as OpenAI.Images.ImageGenerateParams, {
          signal,
          timeout: API_TIMEOUT_MS,
        });
      }

      const items = extractResultItems(response);
      if (items.length === 0) {
        return {
          success: false,
          assets: [],
          text: `Image generation returned no images. Raw response keys: ${Object.keys(response || {}).join(', ')}`,
          error: 'empty-response',
        };
      }

      req.onProgress?.({ stage: 'saving' });

      const assets: MediaAsset[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.b64_json) {
          assets.push(await saveBase64MediaAsset('image', item.b64_json, workspaceDir, i));
        } else if (item.url) {
          assets.push(await downloadUrlMediaAsset('image', item.url, workspaceDir, i));
        }
      }

      if (assets.length === 0) {
        return {
          success: false,
          assets: [],
          text: 'Image generation response contained neither base64 data nor URLs.',
          error: 'empty-items',
        };
      }

      const revisedPrompt = (response.data?.[0] as { revised_prompt?: string } | undefined)?.revised_prompt;
      const text = revisedPrompt ? `Revised prompt: ${revisedPrompt}` : 'Image generated successfully.';
      return { success: true, assets, text };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, assets: [], text: 'Image generation was cancelled.', error: 'cancelled' };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MediaGen][FormA] API call failed:', error);
      return { success: false, assets: [], text: `Error generating image: ${errorMessage}`, error: errorMessage };
    }
  }
}

function extractResultItems(response: OpenAI.Images.ImagesResponse): ImageResultItem[] {
  if (Array.isArray(response?.data) && response.data.length > 0) {
    return response.data as ImageResultItem[];
  }
  // Some gateways (e.g. SiliconFlow) answer with `images: [{url}]` instead.
  const alt = (response as unknown as { images?: ImageResultItem[] })?.images;
  if (Array.isArray(alt) && alt.length > 0) {
    return alt;
  }
  return [];
}
