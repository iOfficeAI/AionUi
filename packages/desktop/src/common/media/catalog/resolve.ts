/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Catalog resolution: provider + model → MediaModelSpec, plus parameter
 * clipping. Renderer-safe (no Node.js imports).
 */

import type { MediaGenParams } from '../types';
import type { CatalogApiForm, CatalogMediaKind, MediaModelMatch, MediaModelSpec } from './types';
import { BUILTIN_IMAGE_MODELS } from './imageModels';
import { BUILTIN_VIDEO_MODELS } from './videoModels';

/**
 * Provider fields needed for matching. Kept structural (not IProvider) so both
 * renderer provider objects and the MCP server's env-reconstructed provider
 * satisfy it.
 */
export type MediaProviderShape = {
  platform?: string;
  base_url?: string;
  name?: string;
};

/**
 * API forms executable in the current build.
 * Phase 1: A + B (synchronous). Phase 2 adds 'C' (async job engine).
 * The settings dropdown and the allowlist both gate on this, so users are
 * never offered a model the runtime cannot actually drive.
 */
export const EXECUTABLE_FORMS: readonly CatalogApiForm[] = ['A', 'B'];

/** Platforms whose SDK is not OpenAI-compatible — generic Form A entries must not fire on them. */
const NON_OPENAI_COMPATIBLE_PLATFORMS = ['anthropic', 'bedrock', 'gemini', 'gemini-vertex-ai'];

/**
 * Hosts that serve image/video models over their own native protocol rather
 * than the OpenAI images API — Stability's `/v2beta/stable-image` multipart
 * endpoints, Replicate/fal/BFL submit-and-poll queues, and so on.
 *
 * A model name alone cannot tell these apart from the same model served by an
 * OpenAI-compatible gateway (`stable-diffusion-3-5-large` is offered by both
 * SiliconFlow and Stability directly), so generic model-name entries are
 * suppressed here. Without this the picker would offer models that are
 * guaranteed to fail at call time — the exact "selectable but not executable"
 * drift the catalog exists to prevent.
 *
 * These are not permanently unsupported: when a native driver lands (phase 2+),
 * the host gets a real catalog entry with its own `endpointStyle`, and a
 * provider-pinned entry always wins over this suppression.
 */
const NATIVE_PROTOCOL_HOST_MARKERS = [
  'api.stability.ai',
  'api.replicate.com',
  'fal.run',
  'api.bfl.ai',
  'api.bfl.ml',
  'cloud.leonardo.ai',
  'api.midjourney.com',
];

const includesIgnoreCase = (haystack: string | undefined, needles: string[]): boolean => {
  if (!haystack) return false;
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
};

const modelMatches = (condition: MediaModelMatch['model'], modelName: string): boolean => {
  if (condition instanceof RegExp) return condition.test(modelName);
  if (Array.isArray(condition)) return condition.some((name) => name.toLowerCase() === modelName.toLowerCase());
  return condition.toLowerCase() === modelName.toLowerCase();
};

const matchesEntry = (spec: MediaModelSpec, provider: MediaProviderShape, modelName: string): boolean => {
  const { match } = spec;
  if (!modelMatches(match.model, modelName)) return false;
  if (match.platform && !match.platform.some((p) => p.toLowerCase() === (provider.platform || '').toLowerCase())) {
    return false;
  }
  if (match.baseUrlIncludes && !includesIgnoreCase(provider.base_url, match.baseUrlIncludes)) return false;
  if (match.providerNameIncludes && !includesIgnoreCase(provider.name, match.providerNameIncludes)) return false;

  // An entry that pinned the provider (platform / base_url / provider name)
  // was written for that provider specifically, so it is trusted as-is.
  // Everything below only guards entries matched by model name alone.
  const isProviderPinned = !!(match.platform || match.baseUrlIncludes || match.providerNameIncludes);
  if (isProviderPinned) return true;

  const requireOpenAi = match.requireOpenAiCompatible ?? spec.form === 'A';
  if (requireOpenAi && NON_OPENAI_COMPATIBLE_PLATFORMS.includes((provider.platform || '').toLowerCase())) {
    return false;
  }
  if (includesIgnoreCase(provider.base_url, NATIVE_PROTOCOL_HOST_MARKERS)) {
    return false;
  }
  return true;
};

const catalogFor = (kind: CatalogMediaKind): MediaModelSpec[] =>
  kind === 'image' ? BUILTIN_IMAGE_MODELS : BUILTIN_VIDEO_MODELS;

/**
 * Resolve provider+model to a catalog spec. First match wins (catalog order is
 * priority order). Returns null when nothing matches.
 */
export const resolveMediaModelSpec = (
  kind: CatalogMediaKind,
  provider: MediaProviderShape,
  modelName: string
): MediaModelSpec | null => {
  if (!modelName) return null;
  return catalogFor(kind).find((spec) => matchesEntry(spec, provider, modelName)) || null;
};

/** Whether this provider+model is offered in pickers and accepted at runtime. */
export const isMediaGenSupported = (
  kind: CatalogMediaKind,
  provider: MediaProviderShape,
  modelName: string
): boolean => {
  const spec = resolveMediaModelSpec(kind, provider, modelName);
  return spec !== null && EXECUTABLE_FORMS.includes(spec.form);
};

export type ClippedParams = {
  params: MediaGenParams;
  /** Names of caller-supplied fields removed because the spec doesn't support them. */
  dropped: string[];
};

/**
 * Clip caller params down to what the spec supports, then merge spec defaults
 * underneath. Unsupported fields are DROPPED (and reported), never rejected —
 * a hard error would send agents into parameter-guessing loops.
 *
 * With a null spec (fallback path) all params are dropped except `n`, since
 * the legacy Form B path never consumed any of them.
 */
export const clipParamsToSpec = (params: MediaGenParams, spec: MediaModelSpec | null): ClippedParams => {
  const dropped: string[] = [];
  const out: MediaGenParams = {};
  const support = spec?.params;

  const take = <K extends keyof MediaGenParams>(key: K, supported: boolean, valid = true) => {
    const value = params[key];
    if (value === undefined) return;
    if (supported && valid) {
      out[key] = value;
    } else {
      dropped.push(key);
    }
  };

  take('size', !!support?.sizes, !params.size || !support?.sizes || support.sizes.includes(params.size));
  take(
    'aspectRatio',
    !!support?.aspectRatios,
    !params.aspectRatio || !support?.aspectRatios || support.aspectRatios.includes(params.aspectRatio)
  );
  take(
    'quality',
    !!support?.qualities,
    !params.quality || !support?.qualities || support.qualities.includes(params.quality)
  );
  take('seed', !!support?.seed);
  take('negativePrompt', !!support?.negativePrompt);
  take(
    'durationSeconds',
    !!support?.durations,
    !params.durationSeconds || !support?.durations || support.durations.includes(params.durationSeconds)
  );
  take(
    'resolution',
    !!support?.resolutions,
    !params.resolution || !support?.resolutions || support.resolutions.includes(params.resolution)
  );
  take('firstFrameImage', !!(support?.imageToVideo || support?.firstLastFrame));
  take('lastFrameImage', !!support?.firstLastFrame);
  take('camera', !!support?.cameras, !params.camera || !support?.cameras || support.cameras.includes(params.camera));

  // n: honored whenever >1 is supported; clamped to maxN. Legacy fallback keeps n=1.
  if (params.n !== undefined) {
    const maxN = support?.maxN ?? 1;
    if (params.n > 1 && maxN <= 1) {
      dropped.push('n');
    } else {
      out.n = Math.max(1, Math.min(Math.floor(params.n), maxN));
    }
  }

  // Merge defaults underneath (caller-provided values win).
  if (spec?.defaults) {
    if (out.size === undefined && out.aspectRatio === undefined && spec.defaults.size) out.size = spec.defaults.size;
    if (out.aspectRatio === undefined && out.size === undefined && spec.defaults.aspectRatio) {
      out.aspectRatio = spec.defaults.aspectRatio;
    }
    if (out.quality === undefined && spec.defaults.quality) out.quality = spec.defaults.quality;
    if (out.durationSeconds === undefined && spec.defaults.durationSeconds) {
      out.durationSeconds = spec.defaults.durationSeconds;
    }
    if (out.resolution === undefined && spec.defaults.resolution) out.resolution = spec.defaults.resolution;
  }

  return { params: out, dropped };
};
