/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Declarative media model catalog — replaces name-regex capability guessing.
 *
 * A catalog entry declares, for one model family: which API form it speaks,
 * how to recognize it (provider + model matching), which parameters it honors,
 * and (for Form C) how to poll it. The runtime resolves provider+model to a
 * spec and dispatches to the matching adapter; the settings UI resolves the
 * same way to build the model dropdown — selectable and executable can no
 * longer drift apart.
 *
 * Renderer-safe: no Node.js imports anywhere under catalog/.
 */

export type CatalogMediaKind = 'image' | 'video';
export type CatalogApiForm = 'A' | 'B' | 'C';

/**
 * Provider/model matching rule. All present conditions must hold (AND).
 * Model matching accepts an exact string, a list of exact strings, or a regex.
 */
export type MediaModelMatch = {
  /** Provider platform ids, e.g. ['gemini', 'gemini-vertex-ai']. */
  platform?: string[];
  /** Substrings looked up (case-insensitive) in provider.base_url. */
  baseUrlIncludes?: string[];
  /** Substrings looked up (case-insensitive) in provider.name. */
  providerNameIncludes?: string[];
  /** Model name condition. */
  model: string | string[] | RegExp;
  /**
   * Form A talks the OpenAI wire protocol; entries that only match by model
   * name should not fire on providers whose SDK is not OpenAI-compatible
   * (gemini / anthropic / bedrock / vertex). Defaults to true for form 'A'
   * entries, false otherwise. Explicit platform matches override this.
   */
  requireOpenAiCompatible?: boolean;
};

/** Parameter capability declaration — what the tool layer may pass through. */
export type MediaModelParamSupport = {
  /** Supported exact sizes, e.g. ['1024x1024', '1792x1024']. */
  sizes?: string[];
  /** Supported aspect ratios, e.g. ['1:1', '16:9'] (models that take ratios). */
  aspectRatios?: string[];
  /** Max number of outputs per request. Absent = 1. */
  maxN?: number;
  /** Supported quality vocabulary, e.g. ['standard', 'hd']. */
  qualities?: string[];
  seed?: boolean;
  negativePrompt?: boolean;
  /** Whether the model accepts input images (edit / image-to-image). */
  imageInput?: boolean;
  // ---- video ----
  /** Supported durations in seconds. */
  durations?: number[];
  /** Supported resolutions, e.g. ['720p', '1080p']. */
  resolutions?: string[];
  /** Supports first-frame conditioning (image-to-video). */
  imageToVideo?: boolean;
  /** Supports first+last frame conditioning. */
  firstLastFrame?: boolean;
  /** Camera movement presets. */
  cameras?: string[];
};

/** Form C polling behavior (required for form 'C' entries). */
export type MediaModelPolling = {
  intervalMs: number;
  timeoutMs: number;
};

export type MediaModelSpec = {
  /** Unique id within the catalog, e.g. 'openai-dall-e-3'. */
  id: string;
  kind: CatalogMediaKind;
  form: CatalogApiForm;
  /**
   * Form C driver name ('dashscope-task' | 'ark-task' | 'openai-video' | ...).
   * Selects the protocol driver inside the TaskPollAdapter (phase 2).
   */
  endpointStyle?: string;
  match: MediaModelMatch;
  params: MediaModelParamSupport;
  /** Defaults merged under caller params (caller wins). */
  defaults?: {
    size?: string;
    aspectRatio?: string;
    quality?: string;
    durationSeconds?: number;
    resolution?: string;
  };
  polling?: MediaModelPolling;
};
