/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MediaApiForm, MediaProviderAdapter } from '../types';
import { ChatMultimodalAdapter } from './chatMultimodalAdapter';
import { OpenAiImagesAdapter } from './openaiImagesAdapter';

const ADAPTERS: Partial<Record<MediaApiForm, MediaProviderAdapter>> = {
  A: new OpenAiImagesAdapter(),
  B: new ChatMultimodalAdapter(),
  // 'C' — TaskPollAdapter arrives with the async job engine (phase 2).
};

export const getMediaAdapter = (form: MediaApiForm): MediaProviderAdapter | undefined => ADAPTERS[form];

export { ChatMultimodalAdapter } from './chatMultimodalAdapter';
export { OpenAiImagesAdapter } from './openaiImagesAdapter';
