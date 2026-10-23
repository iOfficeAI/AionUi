/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Media generation module barrel — main-process / MCP-server consumers.
 *
 * ⚠️ Renderer code must NOT import from here (adapters pull in Node.js APIs).
 * The renderer-safe surface is `@/common/media/catalog` and `./types`.
 */

export * from './types';
export { executeMediaGeneration, type ExecuteMediaGenerationInput } from './executeMediaGeneration';
export { getMediaAdapter } from './adapters';
export {
  isImageFile,
  isVideoFile,
  isHttpUrl,
  safeJsonParse,
  processImageUri,
  saveBase64MediaAsset,
  downloadUrlMediaAsset,
} from './mediaAssets';
