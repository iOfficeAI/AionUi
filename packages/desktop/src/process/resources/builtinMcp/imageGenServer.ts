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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BUILTIN_IMAGE_GEN_ID, BUILTIN_IMAGE_GEN_NAME } from './constants';
import { executeImageGeneration } from '@/common/chat/imageGenCore';
import type { TProviderWithModel } from '@/common/config/storage';

// Read provider config from environment variables, with fallback to
// ~/.pounding/config.json (written by the desktop app on login/sync).
// Some ACP agents (Claude Code) may not pass the transport env vars
// to the stdio MCP server, so we also read from the config file.
function getProviderFromEnv(): TProviderWithModel | null {
  let platform = process.env.POUNDING_IMG_PLATFORM;
  let base_url = process.env.POUNDING_IMG_BASE_URL;
  let api_key = process.env.POUNDING_IMG_API_KEY;
  let model = process.env.POUNDING_IMG_MODEL;

  // Fallback: read from ~/.pounding/config.json
  if (!api_key || !model) {
    try {
      const configPath = path.join(os.homedir(), '.pounding', 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.api_key && !api_key) {
          api_key = config.api_key;
          platform = platform || config.platform || 'new-api';
          base_url = base_url || config.base_url || '';
        }
      }
    } catch {
      // ignore config file errors
    }
  }

  if (!platform || !model) {
    return null;
  }

  return {
    id: BUILTIN_IMAGE_GEN_ID,
    name: BUILTIN_IMAGE_GEN_NAME,
    platform,
    base_url: base_url || '',
    api_key: api_key || '',
    use_model: model,
  };
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_IMAGE_GEN_NAME,
    version: '1.0.0',
  });

  server.tool(
    'pounding_image_generation',
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
          'REQUIRED: The current conversation workspace directory. You MUST always provide this from the conversation context. Generated images will be saved here. Do NOT use process.cwd() or any other fallback — always pass the actual workspace path from the conversation.'
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

      const proxy = process.env.POUNDING_IMG_PROXY || undefined;
      const workspaceDir = workspace_dir || path.join(os.homedir(), '.pounding', 'generated-images');

      const result = await executeImageGeneration({ prompt, image_uris }, provider, workspaceDir, proxy);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: result.text }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text:
              result.text +
              (result.imagePath
                ? `\n\n<!-- POUNDING_IMG:${result.relativeImagePath || path.basename(result.imagePath)} -->`
                : ''),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[ImageGenMCP] Fatal error:', error);
  process.exit(1);
});
