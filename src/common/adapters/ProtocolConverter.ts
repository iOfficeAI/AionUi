/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generic protocol converter interface for transforming requests and responses
 * between different AI service protocols.
 *
 * @template TInput - Input request format (e.g., OpenAI ChatCompletionCreateParams)
 * @template TOutput - Output request format (e.g., Gemini GenerateContentRequest)
 * @template TResponse - Final response format (e.g., OpenAI ChatCompletion)
 */
export interface ProtocolConverter<TInput, TOutput, TResponse> {
  /**
   * Convert input request to target protocol format
   */
  convertRequest(input: TInput): TOutput;

  /**
   * Convert target protocol response back to standard format
   */
  convertResponse(response: any, originalModel: string): TResponse;
}

/**
 * Configuration for protocol converters
 */
export interface ConverterConfig {
  /** Default model to use when not specified */
  defaultModel?: string;
  /** Custom model mapping rules */
  modelMapping?: Record<string, string>;
  /** Additional converter-specific options */
  options?: Record<string, any>;
}
