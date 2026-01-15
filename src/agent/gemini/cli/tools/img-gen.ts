/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/storage';
import { Type } from '@google/genai';
import type { Config, ToolResult, ToolInvocation, ToolLocation, ToolCallConfirmationDetails, ToolResultDisplay, MessageBus } from '@office-ai/aioncli-core';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, getErrorMessage, ToolErrorType } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import { jsonrepair } from 'jsonrepair';
import * as path from 'path';
import type OpenAI from 'openai';
import { ClientFactory, type RotatingClient } from '@/common/ClientFactory';
import type { UnifiedChatCompletionResponse } from '@/common/RotatingApiClient';
import { IMAGE_EXTENSIONS, MIME_TYPE_MAP, MIME_TO_EXT_MAP, DEFAULT_IMAGE_EXTENSION } from '@/common/constants';

/**
 * Safely parse JSON string with jsonrepair fallback
 */
function safeJsonParse<T = unknown>(jsonString: string, fallbackValue: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallbackValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson) as T;
    } catch (repairError) {
      console.warn('[ImageGen] JSON parse failed:', jsonString.substring(0, 50));
      return fallbackValue;
    }
  }
}

const API_TIMEOUT_MS = 120000; // 2 minutes for image generation API calls

// Define specific types for image generation
interface ImageGenerationResult {
  img_url: string;
  relative_path: string;
}

interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail: 'auto' | 'low' | 'high';
  };
}

type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

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

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext as ImageExtension);
}

function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

async function fileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    return fileBuffer.toString('base64');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Provide a more specific error message for missing files
    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
      throw new Error(`Image file not found: ${filePath}`);
    }
    throw new Error(`Failed to read image file: ${errorMessage}`);
  }
}

function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
}

function getFileExtensionFromDataUrl(dataUrl: string): string {
  const mimeTypeMatch = dataUrl.match(/^data:image\/([^;]+);base64,/);
  if (mimeTypeMatch && mimeTypeMatch[1]) {
    const mimeType = mimeTypeMatch[1].toLowerCase();
    return MIME_TO_EXT_MAP[mimeType] || DEFAULT_IMAGE_EXTENSION;
  }
  return DEFAULT_IMAGE_EXTENSION;
}

async function saveGeneratedImage(base64Data: string, config: Config, messageId?: string, conversationId?: string): Promise<string> {
  const workspaceDir = config.getWorkingDir();
  const timestamp = Date.now();
  const fileExtension = getFileExtensionFromDataUrl(base64Data);
  const fileName = `img-${timestamp}${fileExtension}`;
  const filePath = path.join(workspaceDir, fileName);

  const base64WithoutPrefix = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');

  try {
    // Save image to file system (in workspace)
    // The file path will be saved in the message's resultDisplay and persisted to database automatically
    await fs.promises.writeFile(filePath, imageBuffer);

    return filePath;
  } catch (error) {
    console.error('[ImageGen] Failed to save image file:', error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      `AI image generation and analysis tool using OpenRouter API.

Primary Functions:
- Generate new images from English text descriptions
- Analyze and describe existing images (alternative to built-in vision)
- Edit/modify existing images with English text prompts
- Support multiple image processing and comparison

IMPORTANT: All prompts must be in English for optimal results.

When to Use:
- When the current model lacks image analysis capabilities
- For creating new images from text descriptions
- For editing existing images with AI assistance
- For processing multiple images together (comparison, combining, etc.)
- As a fallback when built-in vision features are unavailable
- IMPORTANT: Always use this tool when user mentions @filename with image extensions (.jpg, .jpeg, .png, .gif, .webp, .bmp, .tiff, .svg)

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
            description: 'The text prompt in English that must clearly specify the operation type: "Generate image: [English description]" for creating new images, "Analyze image: [what to analyze in English]" for image recognition/analysis, or "Edit image: [modifications in English]" for image editing. Always start with the operation type and use English for the entire prompt.',
          },
          image_uris: {
            type: Type.ARRAY,
            description: 'Optional: Array of paths to existing local image files or HTTP/HTTPS URLs to edit/modify. Examples: ["test.jpg", "https://example.com/img.png"]. When user uses @filename.ext format, always pass the filename (without @) to this array. For single image, use array format: ["test.jpg"]. Local files must actually exist on disk.',
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

  protected createInvocation(params: ImageGenerationToolParams, messageBus: MessageBus, _toolName?: string, _toolDisplayName?: string): ToolInvocation<ImageGenerationToolParams, ToolResult> {
    return new ImageGenerationInvocation(this.config, this.imageGenerationModel, params, this.proxy, messageBus, _toolName, _toolDisplayName);
  }
}

class ImageGenerationInvocation extends BaseToolInvocation<ImageGenerationToolParams, ToolResult> {
  private rotatingClient: RotatingClient | undefined;
  private currentModel: string;

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

    // Initialize the rotating client using factory
    this.currentModel = this.imageGenerationModel.useModel;
  }

  private async ensureClient(): Promise<RotatingClient> {
    if (!this.rotatingClient) {
      this.rotatingClient = await ClientFactory.createRotatingClient(this.imageGenerationModel, {
        proxy: this.proxy,
        rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
      });
    }
    return this.rotatingClient;
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
    const displayPrompt = this.params.prompt.length > 100 ? this.params.prompt.substring(0, 97) + '...' : this.params.prompt;
    const imageUris = this.getImageUris();

    if (imageUris.length > 0) {
      const imageDisplay = imageUris.length === 1 ? `"${imageUris[0]}"` : `${imageUris.length} images`;
      return `Modifying ${imageDisplay} with prompt: "${displayPrompt}"`;
    } else {
      return `Generating image with prompt: "${displayPrompt}"`;
    }
  }

  override toolLocations(): ToolLocation[] {
    // Images are saved to workspace with timestamp, so no specific location to report
    return [];
  }

  override async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed for image generation
    return false;
  }

  private async processImageUri(imageUri: string): Promise<ImageContent | null> {
    if (isHttpUrl(imageUri)) {
      return {
        type: 'image_url',
        image_url: {
          url: imageUri,
          detail: 'auto',
        },
      };
    } else {
      // 处理本地文件路径：支持绝对路径、相对路径和纯文件名
      let processedUri = imageUri;

      // 如果文件名以@开头，去掉@符号
      if (imageUri.startsWith('@')) {
        processedUri = imageUri.substring(1);
      }

      let fullPath = processedUri;

      // 如果不是绝对路径，尝试拼接工作目录
      if (!path.isAbsolute(processedUri)) {
        const workspaceDir = this.config.getWorkingDir();
        fullPath = path.join(workspaceDir, processedUri);
      }

      // 检查文件是否存在且为图片文件
      try {
        // Check if file exists first
        await fs.promises.access(fullPath, fs.constants.F_OK);

        // Check if it's a valid image file
        if (!isImageFile(fullPath)) {
          throw new Error(`File is not a supported image type: ${fullPath}`);
        }

        // Read and encode the image
        const base64Data = await fileToBase64(fullPath);
        const mimeType = getImageMimeType(fullPath);
        return {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`,
            detail: 'auto',
          },
        };
      } catch (error) {
        // 文件不存在或读取失败，提供详细的错误信息
        const workspaceDir = this.config.getWorkingDir();
        const possiblePaths = [imageUri, path.join(workspaceDir, imageUri)].filter((p, i, arr) => arr.indexOf(p) === i); // 去重

        const errorMessage = error instanceof Error ? error.message : String(error);

        // If it's already a detailed error from fileToBase64, throw it directly
        if (errorMessage.includes('Image file not found') || errorMessage.includes('not a supported image type')) {
          throw error;
        }

        // Otherwise provide detailed search paths
        throw new Error(`Image file not found. Searched paths:\n${possiblePaths.map((p) => `- ${p}`).join('\n')}\n\n` + 'Please ensure the image file exists and has a valid image extension (.jpg, .png, .gif, .webp, etc.)');
      }
    }
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Image generation was cancelled by user before it could start.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    try {
      updateOutput?.('Initializing image generation...');

      // Build message content with explicit operation type for better AI understanding
      const imageUris = this.getImageUris();
      const hasImages = imageUris.length > 0;

      // Add operation type prefix to help AI understand the task
      let enhancedPrompt: string;
      if (hasImages) {
        enhancedPrompt = `Analyze/Edit image: ${this.params.prompt}`;
      } else {
        enhancedPrompt = `Generate image: ${this.params.prompt}`;
      }

      const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: enhancedPrompt,
        },
      ];

      // Process all image URIs (supports both single string and array)
      if (hasImages) {
        updateOutput?.(`Processing ${imageUris.length} image(s)...`);

        // Process images in parallel for better performance
        const imageResults = await Promise.allSettled(imageUris.map((uri) => this.processImageUri(uri)));

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

        // Add successfully processed images to content
        successful.forEach((imageContent) => {
          contentParts.push(imageContent);
        });

        if (successful.length === 0) {
          return {
            llmContent: `Error: Failed to process any images. Errors:\n${errors.join('\n')}`,
            returnDisplay: `Error: Failed to process images:\n${errors.join('\n')}`,
            error: {
              message: `Failed to process ${imageUris.length} images`,
              type: ToolErrorType.EXECUTION_FAILED,
            },
          };
        }

        // If some images failed, show warning but continue
        if (errors.length > 0) {
          updateOutput?.(`Warning: ${errors.length}/${imageUris.length} images failed to process`);
        }
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: contentParts,
        },
      ];

      updateOutput?.('Sending request to AI service...');

      const client = await this.ensureClient();
      const completion: UnifiedChatCompletionResponse = await client.createChatCompletion(
        {
          model: this.currentModel,
          messages: messages as any, // 必要的类型兼容：OpenAI原生格式
        },
        {
          signal,
          timeout: API_TIMEOUT_MS,
        }
      );

      const choice = completion.choices[0];
      if (!choice) {
        const errorMsg = 'No response from image generation API';
        return {
          llmContent: `Error: ${errorMsg}`,
          returnDisplay: errorMsg,
          error: {
            message: errorMsg,
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }

      updateOutput?.('Processing AI response...');

      const responseText = choice.message.content || 'Image generated successfully.';
      let images = choice.message.images;

      // If no images field, try to extract from markdown in content
      // Antigravity proxy returns images as ![image](data:mime;base64,xxx) in content
      if ((!images || images.length === 0) && responseText) {
        const markdownImageRegex = /!\[image\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
        const matches = [...responseText.matchAll(markdownImageRegex)];
        if (matches.length > 0) {
          images = matches.map((match) => ({
            type: 'image_url' as const,
            image_url: { url: match[1] },
          }));
        }
      }

      if (!images || images.length === 0) {
        // No images generated, return text response
        return {
          llmContent: responseText,
          returnDisplay: responseText,
        };
      }

      const firstImage = images[0];

      if (firstImage.type === 'image_url' && firstImage.image_url?.url) {
        updateOutput?.('Saving generated image...');

        // Get conversation_id from config session
        const sessionId = this.config.getSessionId();
        const conversationId = sessionId?.split('########')[0]; // Extract conversation_id from session_id

        const imagePath = await saveGeneratedImage(
          firstImage.image_url.url,
          this.config,
          undefined, // messageId - will be set when message is composed
          conversationId
        );
        const relativeImagePath = path.relative(this.config.getWorkingDir(), imagePath);

        const result = {
          llmContent: `${responseText}\n\nGenerated image saved to: ${imagePath}`,
          returnDisplay: {
            img_url: imagePath,
            relative_path: relativeImagePath,
          } as unknown as ToolResultDisplay,
        };

        return result;
      }

      // Fallback to text response
      return {
        llmContent: responseText,
        returnDisplay: responseText,
      };
    } catch (error) {
      if (signal.aborted) {
        return {
          llmContent: 'Image generation was cancelled by user.',
          returnDisplay: 'Operation cancelled by user.',
        };
      }

      const errorMessage = getErrorMessage(error);
      let errorType: ToolErrorType = ToolErrorType.EXECUTION_FAILED;

      // Map specific errors to appropriate types
      if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
        errorType = ToolErrorType.EXECUTION_FAILED;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorType = ToolErrorType.EXECUTION_FAILED;
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorType = ToolErrorType.EXECUTION_FAILED;
      } else if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        errorType = ToolErrorType.EXECUTION_FAILED;
      }

      return {
        llmContent: `Error generating image: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: errorType,
        },
      };
    }
  }
}
