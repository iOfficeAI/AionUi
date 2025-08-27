/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';

export function getResponseText(response: GenerateContentResponse): string | undefined {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    return undefined;
  }
  const textSegments = parts.map((part) => part.text).filter((text): text is string => typeof text === 'string');

  if (textSegments.length === 0) {
    return undefined;
  }
  return textSegments.join('');
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
