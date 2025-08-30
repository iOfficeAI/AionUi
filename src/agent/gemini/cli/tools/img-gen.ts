/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TModelWithConversation } from '@/common/storage';
import { Type } from '@google/genai';
import type { Config, ToolResult } from '@office-ai/aioncli-core';
import { BaseTool, Icon, SchemaValidator } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import OpenAI from 'openai';
import * as path from 'path';

const REQUEST_TIMEOUT_MS = 120000; // 2 minutes for image generation

export interface ImageGenerationToolParams {
  prompt: string;
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

    // 常见类型映射
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

    // 优先使用映射表，如果没有就直接用MIME类型作为扩展名
    return mimeToExtMap[mimeType] || `.${mimeType}`;
  }
  return '.png'; // 默认后缀
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

export class ImageGenerationTool extends BaseTool<ImageGenerationToolParams, ToolResult> {
  static readonly Name: string = 'aionui_image_generation';
  private openai: OpenAI | null = null;
  private currentModel: string | null = null;

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

Input Support:
- Local file paths (absolute, relative, or filename only)
- HTTP/HTTPS image URLs
- Text prompts for generation or analysis

Output:
- Saves generated/processed images to workspace with timestamp naming
- Returns image path and AI description/analysis`,
      Icon.Hammer,
      {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The text prompt describing what to generate or how to modify the image',
          },
          image_uri: {
            type: Type.STRING,
            description: 'Optional: Path to existing local image file or HTTP/HTTPS URL to edit/modify. Local files must actually exist on disk.',
          },
        },
        required: ['prompt'],
      }
    );
  }

  private async initializeOpenAI(): Promise<void> {
    if (this.openai) {
      return;
    }

    // 1. 优先使用环境变量
    const apiKey = this.imageGenerationModel.apiKey; //|| process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(`OPENROUTER_API_KEY not found. Please either:
1. Set environment variable: export OPENROUTER_API_KEY=your_key
2. Add to ~/.zshrc: export OPENROUTER_API_KEY=your_key
3. Add to ~/.bashrc: export OPENROUTER_API_KEY=your_key

Debug info:
- Environment variable: ${process.env.OPENROUTER_API_KEY ? 'found' : 'not found'}
- Shell config search: not found`);
    }

    // 清理API密钥（过滤不可见字符）
    const cleanedApiKey = apiKey.replace(/[\s\r\n\t]/g, '').trim();

    this.currentModel = this.imageGenerationModel.useModel;
    this.openai = new OpenAI({
      baseURL: this.imageGenerationModel.baseUrl,
      apiKey: cleanedApiKey, // 使用清理后的密钥
      defaultHeaders: {
        'HTTP-Referer': 'https://www.aionui.com',
        'X-Title': 'AionUi',
      },
    });
  }

  validateToolParams(params: ImageGenerationToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parametersJsonSchema, params);
    if (errors) {
      return errors;
    }
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty.";
    }
    return null;
  }

  getDescription(params: ImageGenerationToolParams): string {
    const displayPrompt = params.prompt.length > 100 ? params.prompt.substring(0, 97) + '...' : params.prompt;
    const action = params.image_uri ? 'Editing image with' : 'Generating image with';
    return `${action} prompt: "${displayPrompt}"`;
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

  private async executeImageGeneration(params: ImageGenerationToolParams, signal: AbortSignal): Promise<ToolResult> {
    try {
      await this.initializeOpenAI();

      if (!this.openai) {
        throw new Error('Failed to initialize OpenAI client');
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: params.prompt,
        },
      ];

      if (params.image_uri) {
        const imageContent = await this.processImageUri(params.image_uri);
        if (imageContent) {
          contentParts.push(imageContent);
        }
      }

      messages.push({
        role: 'user',
        content: contentParts,
      });

      // Log API call input
      console.debug('[ImageGen] API call input', {
        model: this.currentModel,
        prompt: params.prompt.length > 100 ? params.prompt.substring(0, 100) + '...' : params.prompt,
        image_uri: params.image_uri || 'none',
      });

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

      // Log API call output
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
        throw new Error('No response from image generation API');
      }

      const responseText = choice.message.content || 'Image generated successfully.';
      const images = (choice.message as any).images;

      if (!images || images.length === 0) {
        return {
          llmContent: responseText,
          returnDisplay: responseText,
        };
      }

      const firstImage = images[0];

      if (firstImage.type === 'image_url' && firstImage.image_url?.url) {
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

      return {
        llmContent: responseText,
        returnDisplay: responseText,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fullErrorMessage = `Error generating image: ${errorMessage}`;

      return {
        llmContent: fullErrorMessage,
        returnDisplay: `❌ ${fullErrorMessage}`,
      };
    }
  }

  async execute(params: ImageGenerationToolParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `❌ ${validationError}`,
      };
    }

    return this.executeImageGeneration(params, signal);
  }
}
