/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiClient, ToolResult } from '@office-ai/aioncli-core';
import { Type } from '@google/genai';
import { getResponseText } from './utils';
import { BaseTool, Icon, SchemaValidator } from '@office-ai/aioncli-core';
import { convert } from 'html-to-text';

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 100000;

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Parameters for the WebFetch tool
 */
export interface WebFetchToolParams {
  /**
   * The URL to fetch content from
   */
  url: string;
  /**
   * The prompt to run on the fetched content
   */
  prompt: string;
}

/**
 * Implementation of the WebFetch tool for AionUi - replaces built-in web_fetch for all models
 */
export class WebFetchTool extends BaseTool<WebFetchToolParams, ToolResult> {
  static readonly Name: string = 'aionui_web_fetch';

  constructor(private readonly geminiClient: GeminiClient) {
    super(WebFetchTool.Name, 'WebFetch', "Fetches content from a specified URL and processes it using an AI model\n- Takes a URL and a prompt as input\n- Fetches the URL content, converts HTML to markdown\n- Processes the content with the prompt using a small, fast model\n- Returns the model's response about the content\n- Use this tool when you need to retrieve and analyze web content\n\nUsage notes:\n  - The URL must be a fully-formed valid URL\n  - The prompt should describe what information you want to extract from the page\n  - This tool is read-only and does not modify any files\n  - Results may be summarized if the content is very large", Icon.Globe, {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'The URL to fetch content from',
        },
        prompt: {
          type: Type.STRING,
          description: 'The prompt to run on the fetched content',
        },
      },
      required: ['url', 'prompt'],
    });
  }

  validateToolParams(params: WebFetchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parametersJsonSchema, params);
    if (errors) {
      return errors;
    }
    if (!params.url || params.url.trim() === '') {
      return "The 'url' parameter cannot be empty.";
    }
    if (!params.url.startsWith('http://') && !params.url.startsWith('https://')) {
      return "The 'url' must start with http:// or https://.";
    }
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty.";
    }
    return null;
  }

  getDescription(params: WebFetchToolParams): string {
    const displayPrompt = params.prompt.length > 100 ? params.prompt.substring(0, 97) + '...' : params.prompt;
    return `Fetching content from ${params.url} and processing with prompt: "${displayPrompt}"`;
  }

  private async executeFetch(params: WebFetchToolParams, signal: AbortSignal): Promise<ToolResult> {
    let url = params.url;

    // Convert GitHub blob URL to raw URL - using secure URL parsing
    try {
      const parsedUrl = new URL(url);
      if ((parsedUrl.hostname === 'github.com' || parsedUrl.hostname === 'www.github.com') && parsedUrl.pathname.includes('/blob/')) {
        url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
      }
    } catch (e) {
      // Invalid URL format - will be handled by the fetch attempt below
      // No need to transform the URL if it's malformed
    }

    try {
      const response = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`Request failed with status code ${response.status} ${response.statusText}`);
      }
      const html = await response.text();
      const textContent = convert(html, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
        ],
      }).substring(0, MAX_CONTENT_LENGTH);

      const processPrompt = `The user requested the following: "${params.prompt}".

I have fetched the content from ${params.url}. Please use the following content to answer the user's request.

---
${textContent}
---`;

      const result = await this.geminiClient.generateContent([{ role: 'user', parts: [{ text: processPrompt }] }], {}, signal);
      const resultText = getResponseText(result) || '';
      return {
        llmContent: resultText,
        returnDisplay: `Content from ${params.url} processed successfully.`,
      };
    } catch (e) {
      const error = e as Error;
      const errorMessage = `Error during fetch for ${url}: ${error.message}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  async execute(params: WebFetchToolParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    return this.executeFetch(params, signal);
  }
}
