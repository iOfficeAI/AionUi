/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Filesystem helpers for media generation: input processing and asset
 * persistence. Main-process / MCP-server only (uses Node.js APIs) — the
 * renderer must never import this file (import from catalog/ instead).
 *
 * Most helpers migrated verbatim from the former common/chat/imageGenCore.ts.
 *
 * HARD RULE (see architecture doc D6): media bytes live on disk only. These
 * helpers persist immediately and return paths; no base64 payload may travel
 * further up the stack.
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonrepair } from 'jsonrepair';
import {
  DEFAULT_IMAGE_EXTENSION,
  DEFAULT_VIDEO_EXTENSION,
  IMAGE_EXTENSIONS,
  MIME_TO_EXT_MAP,
  MIME_TYPE_MAP,
  VIDEO_EXTENSIONS,
  VIDEO_MIME_TO_EXT_MAP,
  VIDEO_MIME_TYPE_MAP,
} from '@/common/config/constants';
import type { MediaAsset, MediaKind } from './types';

type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];
type VideoExtension = (typeof VIDEO_EXTENSIONS)[number];

// ===== Generic utilities =====

export function safeJsonParse<T = unknown>(jsonString: string, fallbackValue: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallbackValue;
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch (_error) {
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson) as T;
    } catch (_repairError) {
      console.warn('[MediaGen] JSON parse failed:', jsonString.substring(0, 50));
      return fallbackValue;
    }
  }
}

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext as ImageExtension);
}

export function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext as VideoExtension);
}

export function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

export async function fileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    return fileBuffer.toString('base64');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
      throw new Error(`Image file not found: ${filePath}`, { cause: error });
    }
    throw new Error(`Failed to read image file: ${errorMessage}`, { cause: error });
  }
}

export function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
}

export function getMediaMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || VIDEO_MIME_TYPE_MAP[ext] || MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
}

export function getFileExtensionFromDataUrl(dataUrl: string): string {
  const mimeTypeMatch = dataUrl.match(/^data:(image|video)\/([^;]+);base64,/);
  if (mimeTypeMatch) {
    const family = mimeTypeMatch[1];
    const subtype = mimeTypeMatch[2].toLowerCase();
    if (family === 'video') {
      return VIDEO_MIME_TO_EXT_MAP[subtype] || DEFAULT_VIDEO_EXTENSION;
    }
    return MIME_TO_EXT_MAP[subtype] || DEFAULT_IMAGE_EXTENSION;
  }
  return DEFAULT_IMAGE_EXTENSION;
}

// ===== Path boundary helpers =====
//
// Reference inputs (image_uris / first_frame_image / markdown-embedded paths)
// are model-supplied strings. `workspaceDir` itself is trusted (the MCP server
// always uses its own process cwd — see builtinMcp/imageGenServer.ts — never a
// value read from the tool call), but a relative reference like
// `../../../../etc/passwd` must still not be allowed to resolve outside it.

const isWithin = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

/**
 * Resolve `candidate` against `workspaceDir` and verify the result stays inside
 * the workspace. A lexical containment check always applies; when the target
 * exists, it is additionally canonicalized with `realpath` so symlinks inside
 * the workspace cannot escape to arbitrary files outside it. Missing targets
 * resolve lexically — the caller's existence check reports "not found".
 */
export const resolveSafePath = async (workspaceDir: string, candidate: string): Promise<string> => {
  const resolved = path.resolve(workspaceDir, candidate);
  if (!isWithin(workspaceDir, resolved)) {
    throw new Error(`Path traversal blocked: "${candidate}" resolves outside workspace`);
  }

  const realWorkspaceDir = await fs.promises.realpath(workspaceDir);
  let realTarget: string;
  try {
    realTarget = await fs.promises.realpath(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved;
    }
    throw error;
  }
  if (!isWithin(realWorkspaceDir, realTarget)) {
    throw new Error(`Path traversal blocked: "${candidate}" resolves outside workspace`);
  }
  return realTarget;
};

// ===== Input processing (reference images for edits / first frames) =====

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail: 'auto' | 'low' | 'high';
  };
}

export async function processImageUri(imageUri: string, workspaceDir: string): Promise<ImageContent | null> {
  if (isHttpUrl(imageUri)) {
    return {
      type: 'image_url',
      image_url: { url: imageUri, detail: 'auto' },
    };
  }

  const processedUri = imageUri.startsWith('@') ? imageUri.substring(1) : imageUri;

  try {
    const fullPath = await resolveSafePath(workspaceDir, processedUri);
    await fs.promises.access(fullPath, fs.constants.F_OK);

    if (!isImageFile(fullPath)) {
      throw new Error(`File is not a supported image type: ${fullPath}`);
    }

    const base64Data = await fileToBase64(fullPath);
    const mimeType = getImageMimeType(fullPath);
    return {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'auto' },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('Path traversal blocked') ||
      errorMessage.includes('Image file not found') ||
      errorMessage.includes('not a supported image type')
    ) {
      throw error;
    }

    const possiblePaths = [imageUri, path.resolve(workspaceDir, imageUri)].filter((p, i, arr) => arr.indexOf(p) === i);
    throw new Error(
      `Image file not found. Searched paths:\n${possiblePaths.map((p) => `- ${p}`).join('\n')}\n\nPlease ensure the image file exists and has a valid image extension (.jpg, .png, .gif, .webp, etc.)`,
      { cause: error }
    );
  }
}

/** Resolve a local input URI ('@'-prefixed / relative / absolute) to an absolute path, bounded to the workspace. */
export async function resolveLocalInputPath(inputUri: string, workspaceDir: string): Promise<string> {
  const processed = inputUri.startsWith('@') ? inputUri.substring(1) : inputUri;
  return resolveSafePath(workspaceDir, processed);
}

// ===== Asset persistence =====

const FILE_PREFIX: Record<MediaKind, string> = { image: 'img', video: 'vid' };

function buildAssetFileName(kind: MediaKind, extension: string, index: number): string {
  const timestamp = Date.now();
  const suffix = index > 0 ? `-${index + 1}` : '';
  return `${FILE_PREFIX[kind]}-${timestamp}${suffix}${extension}`;
}

function toAsset(kind: MediaKind, filePath: string, workspaceDir: string): MediaAsset {
  return {
    kind,
    filePath,
    relativePath: path.relative(workspaceDir, filePath),
    mimeType: getMediaMimeType(filePath),
  };
}

/**
 * Persist a base64 payload (raw or data-URL) to the workspace and return the
 * asset. `index` disambiguates multi-output batches sharing one timestamp.
 */
export async function saveBase64MediaAsset(
  kind: MediaKind,
  base64Data: string,
  workspaceDir: string,
  index = 0
): Promise<MediaAsset> {
  const extension =
    getFileExtensionFromDataUrl(base64Data) || (kind === 'video' ? DEFAULT_VIDEO_EXTENSION : DEFAULT_IMAGE_EXTENSION);
  const fileName = buildAssetFileName(kind, extension, index);
  const filePath = path.join(workspaceDir, fileName);

  const base64WithoutPrefix = base64Data.replace(/^data:(image|video)\/[^;]+;base64,/, '');
  const buffer = Buffer.from(base64WithoutPrefix, 'base64');

  try {
    await fs.promises.writeFile(filePath, buffer);
    return toAsset(kind, filePath, workspaceDir);
  } catch (error) {
    throw new Error(`Failed to save ${kind}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/**
 * Download a result URL to the workspace and return the asset. Providers'
 * result URLs are typically short-lived signed URLs, so download immediately.
 *
 * Note: downloads go direct (no proxy support yet) — result CDNs are usually
 * reachable even where the API endpoint needed a proxy. Revisit with Form C.
 */
export async function downloadUrlMediaAsset(
  kind: MediaKind,
  url: string,
  workspaceDir: string,
  index = 0
): Promise<MediaAsset> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated ${kind}: HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let extension: string | undefined;
  if (contentType.startsWith('image/')) {
    extension = MIME_TO_EXT_MAP[contentType.slice('image/'.length)];
  } else if (contentType.startsWith('video/')) {
    extension = VIDEO_MIME_TO_EXT_MAP[contentType.slice('video/'.length)];
  }
  if (!extension) {
    const urlExt = path.extname(new URL(url).pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(urlExt as ImageExtension) || VIDEO_EXTENSIONS.includes(urlExt as VideoExtension)) {
      extension = urlExt;
    }
  }
  if (!extension) {
    extension = kind === 'video' ? DEFAULT_VIDEO_EXTENSION : DEFAULT_IMAGE_EXTENSION;
  }

  const fileName = buildAssetFileName(kind, extension, index);
  const filePath = path.join(workspaceDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    await fs.promises.writeFile(filePath, buffer);
    return toAsset(kind, filePath, workspaceDir);
  } catch (error) {
    throw new Error(`Failed to save downloaded ${kind}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}
