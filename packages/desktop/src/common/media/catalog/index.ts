/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renderer-safe catalog barrel. Nothing under catalog/ may import Node.js
 * APIs — the settings UI imports from here.
 */

export type {
  CatalogApiForm,
  CatalogMediaKind,
  MediaModelMatch,
  MediaModelParamSupport,
  MediaModelPolling,
  MediaModelSpec,
} from './types';
export { BUILTIN_IMAGE_MODELS } from './imageModels';
export { BUILTIN_VIDEO_MODELS } from './videoModels';
export {
  EXECUTABLE_FORMS,
  clipParamsToSpec,
  isMediaGenSupported,
  resolveMediaModelSpec,
  type ClippedParams,
  type MediaProviderShape,
} from './resolve';
