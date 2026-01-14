/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GroundingMetadata } from '@google/genai';
import { Type } from '@google/genai';
import type { ToolResult, ToolInvocation, ToolLocation, ToolCallConfirmationDetails, Config, MessageBus } from '@office-ai/aioncli-core';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, getErrorMessage, ToolErrorType, getResponseText } from '@office-ai/aioncli-core';

interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string;
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
  confidenceScores?: number[];
}

/**
 * Parameters for the WebSearchTool.
 */
export interface WebSearchToolParams {
  /**
   * The search query.
   */
  query: string;
}

/**
 * Extends ToolResult to include sources for web search.
 */
export interface WebSearchToolResult extends ToolResult {
  sources?: GroundingMetadata extends { groundingChunks: GroundingChunkItem[] } ? GroundingMetadata['groundingChunks'] : GroundingChunkItem[];
}

/**
 * A tool to perform web searches using Google Search via the Gemini API.
 */
export class WebSearchTool extends BaseDeclarativeTool<WebSearchToolParams, WebSearchToolResult> {
  static readonly Name: string = 'gemini_web_search';

  constructor(
    private readonly dedicatedConfig: Config,
    messageBus: MessageBus
  ) {
    super(
      WebSearchTool.Name,
      'GoogleSearch',
      'Performs a web search using Google Search (via the Gemini API) and returns the results. This tool is useful for finding information on the internet based on a query.',
      Kind.Search,
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
        },
        required: ['query'],
      },
      messageBus,
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }

  public override validateToolParams(params: WebSearchToolParams): string | null {
    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  protected createInvocation(params: WebSearchToolParams, messageBus: MessageBus, _toolName?: string, _toolDisplayName?: string): ToolInvocation<WebSearchToolParams, WebSearchToolResult> {
    return new WebSearchInvocation(this.dedicatedConfig, params, messageBus, _toolName, _toolDisplayName);
  }
}

class WebSearchInvocation extends BaseToolInvocation<WebSearchToolParams, WebSearchToolResult> {
  constructor(
    private readonly dedicatedConfig: Config,
    params: WebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Searching the web for: "${this.params.query}"`;
  }

  override toolLocations(): ToolLocation[] {
    return [];
  }

  override async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed for web search
    return false;
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<WebSearchToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Web search was cancelled by user before it could start.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    try {
      updateOutput?.(`Searching the web for: "${this.params.query}"`);

      // Use the authenticated GeminiClient from dedicatedConfig
      const geminiClient = this.dedicatedConfig.getGeminiClient();

      // Use 'web-search' model config alias which has googleSearch enabled
      // See: aioncli-core/src/config/defaultModelConfigs.js
      const response = await geminiClient.generateContent({ model: 'web-search' }, [{ role: 'user', parts: [{ text: this.params.query }] }], signal);

      const responseText = getResponseText(response) || '';
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as GroundingChunkItem[] | undefined;

      if (!responseText) {
        const errorMsg = 'No search results received';
        return {
          llmContent: `Error: ${errorMsg}`,
          returnDisplay: errorMsg,
          error: {
            message: errorMsg,
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }

      // Process grounding information
      let displayContent = responseText;

      if (sources && sources.length > 0) {
        displayContent += '\n\n**Sources:**\n';
        sources.forEach((chunk, index) => {
          if (chunk.web?.title && chunk.web?.uri) {
            displayContent += `${index + 1}. [${chunk.web.title}](${chunk.web.uri})\n`;
          } else if (chunk.web?.uri) {
            displayContent += `${index + 1}. ${chunk.web.uri}\n`;
          }
        });
      }

      updateOutput?.('Search completed successfully');

      return {
        llmContent: responseText,
        returnDisplay: displayContent,
        sources: sources || [],
      };
    } catch (error) {
      if (signal.aborted) {
        return {
          llmContent: 'Web search was cancelled by user.',
          returnDisplay: 'Operation cancelled by user.',
        };
      }

      const errorMessage = getErrorMessage(error);
      const errorType: ToolErrorType = ToolErrorType.EXECUTION_FAILED;

      return {
        llmContent: `Error performing web search: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: errorType,
        },
        sources: [],
      };
    }
  }
}
