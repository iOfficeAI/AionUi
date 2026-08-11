/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { Type } from '@google/genai';
import type {
  Config,
  ToolResult,
  ToolInvocation,
  ToolLocation,
  ToolCallConfirmationDetails,
  ToolResultDisplay,
  MessageBus,
} from '@office-ai/aioncli-core';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolErrorType } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import * as path from 'path';
import { executeImageGeneration, safeJsonParse, isImageFile, isHttpUrl } from '@/common/chat/imageGenCore';

export interface ImageGenerationToolParams {
  /**
   * The text prompt in English describing what to generate or how to modify the image
   */
  prompt: string;

  /**
   * Optional: Array of paths to existing local image files or HTTP/HTTPS URLs to edit/modify
   * Examples: ["test.jpg", "https://example.com/img.png", "abc.png"]
   * Note: May be received as a JSON string from the model
   */
  image_uris?: string[] | string;
}

export class ImageGenerationTool extends BaseDeclarativeTool<ImageGenerationToolParams, ToolResult> {
  static readonly Name: string = 'aionui_image_generation';

  constructor(
    private readonly config: Config,
    private readonly imageGenerationModel: TProviderWithModel,
    private readonly proxy?: string
  ) {
    super(
      ImageGenerationTool.Name,
      'ImageGeneration',
      `REQUIRED tool for generating or editing images. You MUST use this tool for ANY image generation request.

⚠️ CRITICAL: You (the AI assistant) CANNOT generate images directly. You MUST call this tool for:
- Creating/generating any new images from text descriptions
- Drawing, painting, or making any visual content
- Editing or modifying existing images

Primary Functions:
- Generate new images from English text descriptions
- Edit/modify existing images with English text prompts
- Analyze and describe existing images (alternative to built-in vision)

IMPORTANT: All prompts must be in English for optimal results.

When to Use (MANDATORY):
- User asks to "generate", "create", "draw", "make", "paint" an image → MUST use this tool
- User asks for any visual content creation → MUST use this tool
- User asks to edit or modify an image → MUST use this tool
- User mentions @filename with image extensions (.jpg, .jpeg, .png, .gif, .webp, .bmp, .tiff, .svg)

Input Support:
- Multiple local file paths in array format: ["img1.jpg", "img2.png"]
- Multiple HTTP/HTTPS image URLs in array format
- Single or multiple @filename references (pass ALL filenames to image_uris array)
- Text prompts for generation or analysis

Output:
- Saves generated/processed images to workspace with timestamp naming
- Returns image path and AI description/analysis

IMPORTANT: When user provides multiple images (like @img1.jpg @img2.png), ALWAYS pass ALL images to the image_uris parameter as an array: ["img1.jpg", "img2.png"]`,
      Kind.Other,
      {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description:
              'The text prompt in English that must clearly specify the operation type: "Generate image: [English description]" for creating new images, "Analyze image: [what to analyze in English]" for image recognition/analysis, or "Edit image: [modifications in English]" for image editing. Always start with the operation type and use English for the entire prompt.',
          },
          image_uris: {
            type: Type.ARRAY,
            description:
              'Optional: Array of paths to existing local image files or HTTP/HTTPS URLs to edit/modify. Examples: ["test.jpg", "https://example.com/img.png"]. When user uses @filename.ext format, always pass the filename (without @) to this array. For single image, use array format: ["test.jpg"]. Local files must actually exist on disk.',
            items: {
              type: Type.STRING,
            },
          },
        },
        required: ['prompt'],
      },
      config.getMessageBus(),
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }

  public override validateToolParams(params: ImageGenerationToolParams): string | null {
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty.";
    }

    // Validate image_uris if provided
    if (params.image_uris) {
      let imageUris: string[];

      // Handle JSON string format from model
      if (typeof params.image_uris === 'string') {
        const parsed = safeJsonParse<string[]>(params.image_uris, null);
        imageUris = Array.isArray(parsed) ? parsed : [params.image_uris];
      } else if (Array.isArray(params.image_uris)) {
        imageUris = params.image_uris;
      } else {
        return null;
      }

      if (imageUris.length === 0) {
        return null;
      }

      for (let i = 0; i < imageUris.length; i++) {
        const imageUri = imageUris[i].trim();

        if (imageUri === '') {
          return `Empty image URI at index ${i}`;
        }

        // Check if it's a valid URL or file path
        if (!isHttpUrl(imageUri)) {
          // For local files, check if it exists and is an image
          const workspaceDir = this.config.getWorkingDir();
          let actualImagePath: string;

          if (path.isAbsolute(imageUri)) {
            actualImagePath = imageUri;
          } else {
            actualImagePath = path.resolve(workspaceDir, imageUri);
          }

          try {
            fs.accessSync(actualImagePath);
          } catch {
            return `Image file does not exist: ${actualImagePath}`;
          }

          if (!isImageFile(actualImagePath)) {
            return `File is not a supported image type: ${actualImagePath}`;
          }
        }
      }
    }

    return null;
  }

  protected createInvocation(
    params: ImageGenerationToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string
  ): ToolInvocation<ImageGenerationToolParams, ToolResult> {
    return new ImageGenerationInvocation(
      this.config,
      this.imageGenerationModel,
      params,
      this.proxy,
      messageBus,
      _toolName,
      _toolDisplayName
    );
  }
}

class ImageGenerationInvocation extends BaseToolInvocation<ImageGenerationToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    private readonly imageGenerationModel: TProviderWithModel,
    params: ImageGenerationToolParams,
    private readonly proxy: string | undefined,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  private getImageUris(): string[] {
    if (!this.params.image_uris) return [];

    // Handle JSON string format from model
    if (typeof this.params.image_uris === 'string') {
      const parsed = safeJsonParse<string[]>(this.params.image_uris, null);
      return Array.isArray(parsed) ? parsed : [this.params.image_uris];
    }

    return Array.isArray(this.params.image_uris) ? this.params.image_uris : [];
  }

  getDescription(): string {
    const displayPrompt =
      this.params.prompt.length > 100 ? this.params.prompt.substring(0, 97) + '...' : this.params.prompt;
    const imageUris = this.getImageUris();

    if (imageUris.length > 0) {
      const imageDisplay = imageUris.length === 1 ? `"${imageUris[0]}"` : `${imageUris.length} images`;
      return `Modifying ${imageDisplay} with prompt: "${displayPrompt}"`;
    } else {
      return `Generating image with prompt: "${displayPrompt}"`;
    }
  }

  override toolLocations(): ToolLocation[] {
    return [];
  }

  override async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Image generation was cancelled by user before it could start.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    updateOutput?.('Generating image...');

    const workspaceDir = this.config.getWorkingDir();
    const result = await executeImageGeneration(
      this.params,
      this.imageGenerationModel,
      workspaceDir,
      this.proxy,
      signal
    );

    if (!result.success) {
      return {
        llmContent: result.text,
        returnDisplay: result.text,
        error: {
          message: result.error || result.text,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    if (result.imagePath && result.relativeImagePath) {
      return {
        llmContent: result.text,
        returnDisplay: {
          img_url: result.imagePath,
          relative_path: result.relativeImagePath,
        } as unknown as ToolResultDisplay,
      };
    }

    return {
      llmContent: result.text,
      returnDisplay: result.text,
    };
  }
}
