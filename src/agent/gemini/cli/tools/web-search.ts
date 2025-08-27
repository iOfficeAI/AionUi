/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GroundingMetadata } from '@google/genai';
import { Type } from '@google/genai';
import type { GeminiClient, ToolResult } from '@office-ai/aioncli-core';
import { BaseTool, Icon, SchemaValidator } from '@office-ai/aioncli-core';
import { getResponseText, getErrorMessage } from './utils';

interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
  // Other properties might exist if needed in the future
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string; // text is optional as per the example
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
  confidenceScores?: number[]; // Optional as per example
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
export class WebSearchTool extends BaseTool<WebSearchToolParams, WebSearchToolResult> {
  static readonly Name: string = 'gemini_web_search';

  constructor(private readonly geminiClient: GeminiClient) {
    super(WebSearchTool.Name, 'GoogleSearch', 'Performs a web search using Google Search (via the Gemini API) and returns the results. This tool is useful for finding information on the internet based on a query.', Icon.Globe, {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The search query to find information on the web.',
        },
      },
      required: ['query'],
    });
  }

  /**
   * Validates the parameters for the WebSearchTool.
   * @param params The parameters to validate
   * @returns An error message string if validation fails, null if valid
   */
  validateToolParams(params: WebSearchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  getDescription(params: WebSearchToolParams): string {
    return `Searching the web for: "${params.query}"`;
  }

  async execute(params: WebSearchToolParams, signal: AbortSignal): Promise<WebSearchToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    try {
      const response = await this.geminiClient.generateContent([{ role: 'user', parts: [{ text: params.query }] }], { tools: [{ googleSearch: {} }] }, signal);

      const responseText = getResponseText(response);
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as GroundingChunkItem[] | undefined;
      const groundingSupports = groundingMetadata?.groundingSupports as GroundingSupportItem[] | undefined;

      if (!responseText || !responseText.trim()) {
        return {
          llmContent: `Error: No search results found for query "${params.query}".`,
          returnDisplay: `Search completed but no results were returned.`,
        };
      }

      let modifiedResponseText = responseText;
      if (sources && sources.length > 0) {
        const sourceListFormatted: string[] = [];
        sources.forEach((source, index) => {
          const uri = source.web?.uri;
          const title = source.web?.title;
          if (uri && title) {
            sourceListFormatted.push(`[${index + 1}] ${title} (${uri})`);
          }
        });

        if (groundingSupports && groundingSupports.length > 0) {
          const insertions: Array<{ index: number; marker: string }> = [];
          groundingSupports.forEach((support: GroundingSupportItem) => {
            if (support.segment && support.groundingChunkIndices) {
              const citationMarker = support.groundingChunkIndices.map((chunkIndex: number) => `[${chunkIndex + 1}]`).join('');
              insertions.push({
                index: support.segment.endIndex,
                marker: citationMarker,
              });
            }
          });

          insertions.sort((a, b) => b.index - a.index);

          const responseChars = modifiedResponseText.split('');
          insertions.forEach((insertion) => {
            responseChars.splice(insertion.index, 0, insertion.marker);
          });
          modifiedResponseText = responseChars.join('');
        }

        if (sourceListFormatted.length > 0) {
          modifiedResponseText += '\n\nSources:\n' + sourceListFormatted.join('\n');
        }
      }

      const result = {
        llmContent: `Web search results for "${params.query}":\n\n${modifiedResponseText}`,
        returnDisplay: `Search results for "${params.query}" returned.`,
        sources,
      };

      return result;
    } catch (error: unknown) {
      const errorMessage = `Error during web search for query "${params.query}": ${getErrorMessage(error)}`;
      console.error('[ERROR] gemini_web_search failed:', errorMessage);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
      };
    }
  }
}
