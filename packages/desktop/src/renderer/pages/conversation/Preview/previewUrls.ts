/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';
import { buildFileStreamUrl } from '@/renderer/utils/file/fileUrls';

/**
 * Build the backend stream URL for a ChatFileRef-addressed file.
 *
 * `GET /api/fs/stream` is a raw byte range server (Content-Type + Range) that the
 * PDF `<webview>` loads directly. The identity travels as a flattened ChatFileRef
 * query (a webview GET has no request body): `kind` selects the variant, then
 * `pe_id`+`relative_path` (project) or `path` (upload/local). URLSearchParams
 * percent-encodes each value; the backend's serde_urlencoded Query decodes it.
 */
export const buildStreamUrl = (ref: ChatFileRef): string => {
  return buildFileStreamUrl(ref);
};

/**
 * Build the src for the PDF `<webview>`.
 *
 * Prefer the ChatFileRef identity → an authenticated backend stream URL (Range +
 * Content-Type served by the backend; the renderer never sees an absolute path,
 * unlike the old `file://` src). Fall back to inline `content` (e.g. a blob/data
 * URL) when no ref is available.
 */
export const buildPdfSrc = (fileRef?: ChatFileRef, content?: string): string => {
  if (fileRef) return buildStreamUrl(fileRef);
  return content || '';
};
