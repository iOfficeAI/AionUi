/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in MCP server for image generation.
 * Runs as a standalone stdio process spawned by the MCP client.
 * Reads provider config from environment variables.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { format } from 'node:util';

// Keep these literals local so the MCP bootstrap path does not import the app's
// storage layer, which writes debug output to stdout and breaks stdio handshakes.
const BUILTIN_IMAGE_GEN_ID = 'builtin-image-gen';
const BUILTIN_IMAGE_GEN_NAME = 'aionui-image-generation';

type ImageGenerationProvider = {
  id: string;
  name: string;
  platform: string;
  baseUrl: string;
  apiKey: string;
  useModel: string;
};

function redirectConsoleToStderr(): void {
  const writeToStderr = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };

  console.log = writeToStderr as typeof console.log;
  console.info = writeToStderr as typeof console.info;
  console.warn = writeToStderr as typeof console.warn;
  console.debug = writeToStderr as typeof console.debug;
}

function divertStdoutToStderrDuringBootstrap(): () => void {
  const originalWrite = process.stdout.write.bind(process.stdout) as typeof process.stdout.write;

  process.stdout.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    cb?: (error?: Error | null) => void
  ) => {
    if (typeof encoding === 'function') {
      return process.stderr.write(chunk, encoding);
    }

    if (cb) {
      return process.stderr.write(chunk, encoding, cb);
    }

    return process.stderr.write(chunk, encoding);
  }) as typeof process.stdout.write;

  return () => {
    process.stdout.write = originalWrite;
  };
}

// Read provider config from environment variables
function getProviderFromEnv(): ImageGenerationProvider | null {
  const platform = process.env.AIONUI_IMG_PLATFORM;
  const baseUrl = process.env.AIONUI_IMG_BASE_URL;
  const apiKey = process.env.AIONUI_IMG_API_KEY;
  const model = process.env.AIONUI_IMG_MODEL;

  if (!platform || !model) {
    return null;
  }

  return {
    id: BUILTIN_IMAGE_GEN_ID,
    name: BUILTIN_IMAGE_GEN_NAME,
    platform,
    baseUrl: baseUrl || '',
    apiKey: apiKey || '',
    useModel: model,
  };
}

async function main() {
  redirectConsoleToStderr();
  const restoreStdout = divertStdoutToStderrDuringBootstrap();
  const { executeImageGeneration } = await import('@/common/chat/imageGenCore');

  const server = new McpServer({
    name: BUILTIN_IMAGE_GEN_NAME,
    version: '1.0.0',
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

Output:
- Saves generated/processed images to workspace with timestamp naming
- Returns image path and AI description/analysis

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
          'Optional: Array of paths to existing local image files or HTTP/HTTPS URLs to edit/modify. Examples: ["test.jpg", "https://example.com/img.png"]. For single image, use array format: ["test.jpg"].'
        ),
      workspace_dir: z
        .string()
        .optional()
        .describe(
          'Optional: Working directory for resolving relative paths and saving output images. Defaults to current working directory.'
        ),
    },
    async ({ prompt, image_uris, workspace_dir }) => {
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
      const workspaceDir = workspace_dir || process.cwd();

      const result = await executeImageGeneration({ prompt, image_uris }, provider, workspaceDir, proxy);

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
  );

  const transport = new StdioServerTransport();
  restoreStdout();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[ImageGenMCP] Fatal error:', error);
  process.exit(1);
});
