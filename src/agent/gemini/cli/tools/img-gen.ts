/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TModelWithConversation } from '@/common/storage';
import { Type } from '@google/genai';
import type { Config, ToolResult, ToolInvocation, ToolLocation, ToolCallConfirmationDetails } from '@office-ai/aioncli-core';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, getErrorMessage, ToolErrorType } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import OpenAI from 'openai';
import * as path from 'path';

const REQUEST_TIMEOUT_MS = 120000; // 2 minutes for image generation

export interface ImageGenerationToolParams {
  /**
   * The text prompt describing what to generate or how to modify the image
   */
  prompt: string;

  /**
   * Optional: Path to existing local image file or HTTP/HTTPS URL to edit/modify
   */
  image_uri?: string;
}

function isImageFile(filePath: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];
  const ext = path.extname(filePath).toLowerCase();
  return imageExtensions.includes(ext);
}

function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

async function fileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return fileBuffer.toString('base64');
  } catch (error) {
    throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.svg': 'image/svg+xml',
  };
  return mimeMap[ext] || 'image/png';
}

function getFileExtensionFromDataUrl(dataUrl: string): string {
  const mimeTypeMatch = dataUrl.match(/^data:image\/([^;]+);base64,/);
  if (mimeTypeMatch && mimeTypeMatch[1]) {
    const mimeType = mimeTypeMatch[1].toLowerCase();

    const mimeToExtMap: Record<string, string> = {
      jpeg: '.jpg',
      jpg: '.jpg',
      png: '.png',
      gif: '.gif',
      webp: '.webp',
      bmp: '.bmp',
      tiff: '.tiff',
      'svg+xml': '.svg',
    };

    return mimeToExtMap[mimeType] || `.${mimeType}`;
  }
  return '.png';
}

async function saveGeneratedImage(base64Data: string, config: Config): Promise<string> {
  const workspaceDir = config.getWorkingDir();
  const timestamp = Date.now();
  const fileExtension = getFileExtensionFromDataUrl(base64Data);
  const fileName = `img-${timestamp}${fileExtension}`;
  const filePath = path.join(workspaceDir, fileName);

  const base64WithoutPrefix = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');

  try {
    fs.writeFileSync(filePath, imageBuffer);
    return filePath;
  } catch (error) {
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export class ImageGenerationTool extends BaseDeclarativeTool<ImageGenerationToolParams, ToolResult> {
  static readonly Name: string = 'aionui_image_generation';

  constructor(
    private readonly config: Config,
    private readonly imageGenerationModel: TModelWithConversation
  ) {
    super(
      ImageGenerationTool.Name,
      'ImageGeneration',
      `AI image generation and analysis tool using OpenRouter API.

Primary Functions:
- Generate new images from text descriptions
- Analyze and describe existing images (alternative to built-in vision)
- Edit/modify existing images with text prompts
- Support image format conversion and processing

When to Use:
- When the current model lacks image analysis capabilities
- For creating new images from text descriptions
- For editing existing images with AI assistance
- As a fallback when built-in vision features are unavailable
- IMPORTANT: Always use this tool when user mentions @filename with image extensions (.jpg, .jpeg, .png, .gif, .webp, .bmp, .tiff, .svg)

Input Support:
- Local file paths (absolute, relative, or filename only)
- HTTP/HTTPS image URLs
- Text prompts for generation or analysis
- @filename references to local image files (automatically pass the filename to image_uri parameter)

Output:
- Saves generated/processed images to workspace with timestamp naming
- Returns image path and AI description/analysis`,
      Kind.Other,
      {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The text prompt describing what to generate or how to modify the image',
          },
          image_uri: {
            type: Type.STRING,
            description: 'Optional: Path to existing local image file or HTTP/HTTPS URL to edit/modify. When user uses @filename.ext format with image extensions, always pass the filename (without @) to this parameter. Local files must actually exist on disk.',
          },
        },
        required: ['prompt'],
      },
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }

  public override validateToolParams(params: ImageGenerationToolParams): string | null {
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty.";
    }

    // Validate image_uri if provided
    if (params.image_uri) {
      const imageUri = params.image_uri.trim();

      // Check if it's a valid URL or file path
      if (!isHttpUrl(imageUri) && imageUri !== '') {
        // For local files, check if it exists and is an image
        const workspaceDir = this.config.getWorkingDir();
        let actualImagePath: string;

        if (path.isAbsolute(imageUri)) {
          actualImagePath = imageUri;
        } else {
          actualImagePath = path.resolve(workspaceDir, imageUri);
        }

        if (!fs.existsSync(actualImagePath)) {
          return `Image file does not exist: ${actualImagePath}`;
        }

        if (!isImageFile(actualImagePath)) {
          return `File is not a supported image type: ${actualImagePath}`;
        }
      }
    }

    return null;
  }

  protected createInvocation(params: ImageGenerationToolParams): ToolInvocation<ImageGenerationToolParams, ToolResult> {
    return new ImageGenerationInvocation(this.config, this.imageGenerationModel, params);
  }
}

class ImageGenerationInvocation extends BaseToolInvocation<ImageGenerationToolParams, ToolResult> {
  private openai: OpenAI | null = null;
  private currentModel: string | null = null;

  constructor(
    private readonly config: Config,
    private readonly imageGenerationModel: TModelWithConversation,
    params: ImageGenerationToolParams
  ) {
    super(params);
  }

  getDescription(): string {
    const displayPrompt = this.params.prompt.length > 100 ? this.params.prompt.substring(0, 97) + '...' : this.params.prompt;

    if (this.params.image_uri) {
      return `Modifying image "${this.params.image_uri}" with prompt: "${displayPrompt}"`;
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

  private async processImageUri(imageUri: string): Promise<{ type: 'image_url'; image_url: { url: string; detail: 'auto' | 'low' | 'high' } } | null> {
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
      if (fs.existsSync(fullPath) && isImageFile(fullPath)) {
        const base64Data = await fileToBase64(fullPath);
        const mimeType = getImageMimeType(fullPath);
        return {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`,
            detail: 'auto',
          },
        };
      } else {
        // 如果拼接工作目录后还是找不到，提供详细的错误信息
        const workspaceDir = this.config.getWorkingDir();
        const possiblePaths = [imageUri, path.join(workspaceDir, imageUri)].filter((p, i, arr) => arr.indexOf(p) === i); // 去重

        throw new Error(`Image file not found. Searched paths:
${possiblePaths.map((p) => `- ${p}`).join('\n')}

Please ensure the image file exists and has a valid image extension (.jpg, .png, .gif, .webp, etc.)`);
      }
    }
  }

  private async initializeOpenAI(): Promise<void> {
    if (this.openai) {
      return;
    }

    const apiKey = this.imageGenerationModel.apiKey;

    if (!apiKey) {
      throw new Error(`OPENROUTER_API_KEY not found. Please configure API key in model settings.`);
    }

    // Clean API key
    const cleanedApiKey = apiKey.replace(/[\s\r\n\t]/g, '').trim();

    this.currentModel = this.imageGenerationModel.useModel;
    this.openai = new OpenAI({
      baseURL: this.imageGenerationModel.baseUrl,
      apiKey: cleanedApiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://www.aionui.com',
        'X-Title': 'AionUi',
      },
    });
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Image generation was cancelled by user before it could start.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    try {
      await this.initializeOpenAI();

      if (!this.openai) {
        const errorMsg = 'Failed to initialize OpenAI client';
        return {
          llmContent: `Error: ${errorMsg}`,
          returnDisplay: errorMsg,
          error: {
            message: errorMsg,
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }

      updateOutput?.('Initializing image generation...');

      // Build message content using the same structure as the original implementation
      const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: this.params.prompt,
        },
      ];

      if (this.params.image_uri) {
        const imageContent = await this.processImageUri(this.params.image_uri);
        if (imageContent) {
          contentParts.push(imageContent);
        }
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: contentParts,
        },
      ];

      // Log API call input
      console.debug('[ImageGen] API call input', {
        model: this.currentModel,
        prompt: this.params.prompt.length > 100 ? this.params.prompt.substring(0, 100) + '...' : this.params.prompt,
        image_uri: this.params.image_uri || 'none',
      });

      updateOutput?.('Sending request to AI service...');

      const completion = await this.openai.chat.completions.create(
        {
          model: this.currentModel,
          messages: messages,
        },
        {
          signal,
          timeout: REQUEST_TIMEOUT_MS,
        }
      );

      // Log API call output for debugging
      const responseContent = completion.choices[0]?.message?.content;
      console.debug('[ImageGen] API call output', {
        model: completion.model,
        usage: completion.usage,
        response: {
          content: responseContent && responseContent.length > 100 ? responseContent.substring(0, 100) + '...' : responseContent,
          images: (completion.choices[0]?.message as any)?.images?.length || 0,
        },
      });

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
      const images = (choice.message as any).images;

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
        const imagePath = await saveGeneratedImage(firstImage.image_url.url, this.config);
        const relativeImagePath = path.relative(this.config.getWorkingDir(), imagePath);

        return {
          llmContent: `${responseText}\n\nGenerated image saved to: ${imagePath}`,
          returnDisplay: {
            img_url: imagePath,
            relative_path: relativeImagePath,
          } as unknown as any,
        };
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
