/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core type layer for media generation (image + video).
 *
 * Design doc: docs/specs/media-generation/architecture.zh-CN.md
 *
 * These shapes are deliberately complete from day one — video parameters and
 * the async (Form C) surface are declared here even though phase 1 only ships
 * the synchronous image forms. Later phases add implementations, not shapes.
 *
 * This file must stay free of Node.js imports: it is shared by the renderer
 * (settings UI, capability checks) and the main/MCP processes.
 */

import type { TProviderWithModel } from '@/common/config/storage';
import type { MediaModelSpec } from './catalog/types';

export type MediaKind = 'image' | 'video';

/**
 * The three API shapes found in the wild:
 * - 'A' — synchronous REST (`POST .../images/generations`): DALL·E, gpt-image-1,
 *   SiliconFlow/gateway-hosted Flux & SD, Seedream on Ark, CogView, ...
 * - 'B' — chat completions multimodal output (images come back on the chat
 *   response): Gemini image-preview, OpenRouter.
 * - 'C' — submit + poll task APIs: all video models, plus WanX/Jimeng images.
 */
export type MediaApiForm = 'A' | 'B' | 'C';

/**
 * Unified generation parameters. Which fields are honored for a given model is
 * declared by its catalog spec (`MediaModelSpec.params`); unsupported fields
 * are clipped (not rejected) before reaching the adapter so agents never get
 * stuck retrying parameter permutations.
 */
export type MediaGenParams = {
  // ---- image ----
  /** Exact output size, e.g. '1024x1024'. Mutually exclusive with aspectRatio. */
  size?: string;
  /** Aspect ratio, e.g. '16:9'. Used by models that take ratios instead of sizes. */
  aspectRatio?: string;
  /** Number of outputs to generate. */
  n?: number;
  /** Quality tier, model-specific vocabulary (e.g. 'standard' | 'hd'). */
  quality?: string;
  /** Reproducibility seed, for models that support it. */
  seed?: number;
  /** Negative prompt, for models that support it. */
  negativePrompt?: string;
  // ---- video (phase 3 execution; shape reserved now) ----
  /** Video duration in seconds. */
  durationSeconds?: number;
  /** Video resolution, e.g. '720p' | '1080p'. */
  resolution?: string;
  /** First-frame image (local path or URL) for image-to-video. */
  firstFrameImage?: string;
  /** Last-frame image for first/last-frame conditioning. */
  lastFrameImage?: string;
  /** Camera movement preset, model-specific vocabulary. */
  camera?: string;
};

/** A generated media file, already persisted to disk (bytes never cross IPC/TCP). */
export type MediaAsset = {
  kind: MediaKind;
  /** Absolute path of the saved file — the only carrier of media bytes. */
  filePath: string;
  /** Path relative to the workspace dir, for display and agent references. */
  relativePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** Cover frame for videos, when available. */
  coverFramePath?: string;
};

/** Progress updates emitted during generation (meaningful mostly for Form C). */
export type MediaProgressUpdate = {
  stage: 'preparing' | 'submitted' | 'queued' | 'running' | 'downloading' | 'saving';
  percent?: number;
  /** Remote task id for Form C jobs, present once submitted. */
  taskId?: string;
  message?: string;
};

export type MediaGenRequest = {
  kind: MediaKind;
  prompt: string;
  params: MediaGenParams;
  /** Reference inputs: local paths or HTTP(S) URLs (edit sources, first frames...). */
  inputUris: string[];
  provider: TProviderWithModel;
  /**
   * Resolved catalog spec. `null` means "no catalog match" — the dispatcher
   * falls back to Form B, which preserves the pre-catalog behavior for any
   * provider/model combination that used to work.
   */
  spec: MediaModelSpec | null;
  workspaceDir: string;
  proxy?: string;
  signal?: AbortSignal;
  onProgress?: (update: MediaProgressUpdate) => void;
};

export type MediaGenOutcome = {
  success: boolean;
  /** All generated assets — multi-image results are fully preserved. */
  assets: MediaAsset[];
  /** Human/agent readable summary. Always safe to relay (no inline base64). */
  text: string;
  /** Params that were requested but clipped because the model doesn't support them. */
  droppedParams?: string[];
  /** Async job id — reserved for phase 2 (Form C job engine). */
  jobId?: string;
  error?: string;
};

/**
 * One adapter per API form. Adapters receive an already-validated request
 * (params clipped to spec) and are responsible for the wire call, response
 * handling, and persisting every returned asset to disk.
 */
export interface MediaProviderAdapter {
  readonly form: MediaApiForm;
  generate(req: MediaGenRequest): Promise<MediaGenOutcome>;
}
