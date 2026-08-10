/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in MCP server for image generation.
 * Runs as a standalone stdio process spawned by the MCP client.
 * Reads provider config from environment variables and dispatches through the
 * media generation layer (common/media), which resolves the model's API form
 * (images API / chat multimodal) from the declarative catalog.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BUILTIN_IMAGE_GEN_ID, BUILTIN_IMAGE_GEN_NAME } from './constants';
import { executeMediaGeneration } from '@/common/media';
import { safeJsonParse } from '@/common/media/mediaAssets';
import { IMAGE_GEN_ENV_KEYS } from '@/common/config/imageGenerationMcpEnv';
import type { TProviderWithModel } from '@/common/config/storage';

// Read provider config from environment variables
export function getProviderFromEnv(): TProviderWithModel | null {
  const platform = process.env[IMAGE_GEN_ENV_KEYS.platform];
  const base_url = process.env[IMAGE_GEN_ENV_KEYS.baseUrl];
  const api_key = process.env[IMAGE_GEN_ENV_KEYS.apiKey];
  const model = process.env[IMAGE_GEN_ENV_KEYS.model];
  const providerName = process.env[IMAGE_GEN_ENV_KEYS.providerName];

  if (!platform || !model) {
    return null;
  }

  return {
    id: BUILTIN_IMAGE_GEN_ID,
    // Prefer the real provider name (catalog entries may match on it);
    // fall back to the builtin server name for configs saved before the
    // providerName env key existed.
    name: providerName || BUILTIN_IMAGE_GEN_NAME,
    platform,
    base_url: base_url || '',
    api_key: api_key || '',
    use_model: model,
  };
}

export function normalizeImageUris(imageUris: string[] | string | undefined): string[] {
  if (!imageUris) return [];
  if (Array.isArray(imageUris)) return imageUris;
  const parsed = safeJsonParse<string[] | null>(imageUris, null);
  return Array.isArray(parsed) ? parsed : [imageUris];
}

export type ImageGenerationToolArgs = {
  prompt: string;
  image_uris?: string[];
  size?: string;
  aspect_ratio?: string;
  n?: number;
  quality?: string;
  seed?: number;
  negative_prompt?: string;
};

/**
 * The tool handler, extracted from `server.tool(...)` so it can be exercised
 * directly by tests without spinning up a real MCP stdio transport.
 */
export async function handleImageGeneration({
  prompt,
  image_uris,
  size,
  aspect_ratio,
  n,
  quality,
  seed,
  negative_prompt,
}: ImageGenerationToolArgs) {
  const provider = getProviderFromEnv();
  if (!provider) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: Image generation model not configured. Please select an image generation model in Settings > Tools.',
        },
      ],
      isError: true,
    };
  }

  const proxy = process.env.AIONUI_IMG_PROXY || undefined;
  // Trusted workspace root: the MCP server inherits the agent process cwd,
  // which the backend sets to the conversation workspace. Never accept a
  // workspace path from the model (path traversal boundary).
  const workspaceDir = process.cwd();

  const result = await executeMediaGeneration({
    kind: 'image',
    prompt,
    params: {
      size,
      aspectRatio: aspect_ratio,
      n,
      quality,
      seed,
      negativePrompt: negative_prompt,
    },
    inputUris: normalizeImageUris(image_uris),
    provider,
    workspaceDir,
    proxy,
  });

  if (!result.success) {
    return {
      content: [{ type: 'text' as const, text: result.text }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: result.text }],
  };
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_IMAGE_GEN_NAME,
    version: '1.1.0',
  });

  server.tool(
    'aionui_image_generation',
    `REQUIRED tool for generating or editing images. You MUST use this tool for ANY image generation request.

CRITICAL: You (the AI assistant) CANNOT generate images directly. You MUST call this tool for:
- Creating/generating any new images from text descriptions
- Drawing, painting, or making any visual content
- Editing or modifying existing images

Primary Functions:
- Generate new images from English text descriptions
- Edit/modify existing images with English text prompts

IMPORTANT: All prompts must be in English for optimal results.

When to Use (MANDATORY):
- User asks to "generate", "create", "draw", "make", "paint" an image
- User asks for any visual content creation
- User asks to edit or modify an image
- User mentions @filename with image extensions (.jpg, .jpeg, .png, .gif, .webp, .bmp, .tiff, .svg)

Input Support:
- Multiple local file paths in array format: ["img1.jpg", "img2.png"]
- Multiple HTTP/HTTPS image URLs in array format
- Text prompts for generation or analysis
- Optional generation parameters (size, count, quality, seed, negative prompt) — support depends on the configured model; unsupported parameters are ignored (never retry just to change them)

Output:
- Saves generated/processed images to workspace with timestamp naming (all images when the model returns several)
- Returns image path(s) and AI description/analysis

IMPORTANT: When user provides multiple images, ALWAYS pass ALL images to the image_uris parameter as an array.`,
    {
      prompt: z
        .string()
        .describe(
          'The text prompt in English that must clearly specify the operation type: "Generate image: [description]" for creating new images, "Analyze image: [what to analyze]" for image recognition/analysis, or "Edit image: [modifications]" for image editing.'
        ),
      image_uris: z
        .array(z.string())
        .optional()
        .describe(
          'Optional: Array of paths to existing local image files or HTTP/HTTPS URLs to edit/modify. Examples: ["test.jpg", "https://example.com/img.png"]. For single image, use array format: ["test.jpg"]. Relative paths are resolved against the current working directory.'
        ),
      size: z
        .string()
        .optional()
        .describe(
          'Optional: Output size like "1024x1024" or "1792x1024". Only pass when the user asks for a specific size/orientation.'
        ),
      aspect_ratio: z
        .string()
        .optional()
        .describe('Optional: Aspect ratio like "16:9". Alternative to size for models that take ratios.'),
      n: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Optional: Number of images to generate (default 1). Clamped to what the model supports.'),
      quality: z
        .string()
        .optional()
        .describe('Optional: Quality tier such as "standard" | "hd" | "low" | "medium" | "high", model-dependent.'),
      seed: z.number().int().optional().describe('Optional: Reproducibility seed, for models that support it.'),
      negative_prompt: z
        .string()
        .optional()
        .describe('Optional: What the image should NOT contain, for models that support negative prompts.'),
    },
    handleImageGeneration
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Skip the real stdio transport under Vitest: this module is imported by
// tests to exercise `handleImageGeneration`/`getProviderFromEnv` directly,
// and connecting a real StdioServerTransport there would hang the test
// process waiting on stdin instead of exercising the app's runtime path
// (the script is always launched via `node <scriptPath>`, never imported).
if (!process.env.VITEST) {
  main().catch((error) => {
    console.error('[ImageGenMCP] Fatal error:', error);
    process.exit(1);
  });
}
