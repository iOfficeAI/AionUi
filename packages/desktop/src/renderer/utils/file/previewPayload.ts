/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { PreviewContentType } from '@/common/types/office/preview';

/**
 * Size gate for text-like previews (markdown / html / code / diff).
 *
 * Above this the file is not read at all: CodeMirror state construction grows
 * super-linearly with document size, and — more importantly — a partially read
 * document must never reach an editor that can save, or saving destroys the
 * unread remainder.
 *
 * Hard-coded this round; a later change moves it to a client setting, at which
 * point only {@link resolvePreviewPayload} needs to read the setting.
 */
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

/**
 * Size gate for images, deliberately far higher than the text one: 1MB is small
 * for a photo, while an image is read as a data URL (whole file in memory, ~33%
 * base64 inflation), so it still needs a ceiling.
 */
const IMAGE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Timeout for text content reads, so a stuck read cannot leave the panel
 * hanging. Only text is guarded: an image data URL of a near-limit file is tens
 * of megabytes and legitimately slower, and images were never guarded before.
 */
const TEXT_READ_TIMEOUT_MS = 5000;

/**
 * Types rendered without reading content: pdf loads from the stream URL and
 * office resolves the ref server-side for its own watch. They carry no editable
 * content, so no size gate applies either.
 */
const CONTENT_FREE_TYPES = new Set<PreviewContentType>(['pdf', 'word', 'excel', 'ppt']);

/**
 * Size ceiling for a content type, or `undefined` when the type has no gate.
 */
const thresholdBytesFor = (contentType: PreviewContentType): number | undefined => {
  if (CONTENT_FREE_TYPES.has(contentType)) return undefined;
  return contentType === 'image' ? IMAGE_PREVIEW_MAX_BYTES : TEXT_PREVIEW_MAX_BYTES;
};

/** Resolved payload for one preview tab. */
export type PreviewPayload = {
  /** Read content, or `''` when the type reads none / the file is oversized. */
  content: string;
  /**
   * File exceeded its size ceiling. Content was never read, so nothing can be
   * truncated and nothing truncated can be written back.
   */
  oversized: boolean;
  /** Actual size in bytes, for the oversized message. */
  sizeBytes: number;
  /**
   * Ceiling that was applied, captured at open time. Stored rather than
   * recomputed at render time so that a later settings-backed threshold only
   * affects newly opened tabs, never one already on screen.
   */
  thresholdBytes?: number;
  /**
   * Last-known modification time, the `If-Match` condition for the optimistic
   * concurrency check on save. Taken from the same metadata call as `size` —
   * this is the only reason every type fetches metadata, including the ones with
   * no size gate.
   */
  lastModified: number;
};

/**
 * The single point that decides what a preview tab receives, shared by every
 * open path (explorer tree, message file links, tool-card previews).
 *
 * Two things happen in one metadata round trip, and both callers depend on it:
 *
 * 1. `size` decides whether the content is read at all. Previously each entry
 *    point truncated differently (or not at all), which is what allowed an
 *    oversized file to be opened partially and then saved back — destroying the
 *    part that was never read.
 * 2. `lastModified` becomes the save-time conflict-detection condition. Fetching
 *    it here is what makes "opened but never saved" tabs protected; splitting it
 *    into a second request would double the round trips for no gain.
 *
 * Throws when the file cannot be stat'd (missing / unreadable), which every
 * caller already handles as its own flavour of "file not available".
 *
 * @param fileRef     Identity to read — resolution to a path stays in the backend.
 * @param contentType Decides the read encoding and which ceiling applies.
 */
export const resolvePreviewPayload = async (
  fileRef: ChatFileRef,
  contentType: PreviewContentType
): Promise<PreviewPayload> => {
  // Throws when the file is missing — callers map that to their own fallback.
  const metadata = await ipcBridge.fs.getContentMetadata.invoke({ file: fileRef });

  const sizeBytes = metadata.size;
  const thresholdBytes = thresholdBytesFor(contentType);
  // `>` not `>=`: "larger than 1MB" should not reject a file of exactly 1MB.
  const oversized = thresholdBytes !== undefined && sizeBytes > thresholdBytes;

  const base = {
    oversized,
    sizeBytes,
    thresholdBytes,
    lastModified: metadata.lastModified,
  };

  // Oversized, or a type that renders without content: read nothing.
  if (oversized || CONTENT_FREE_TYPES.has(contentType)) {
    return { ...base, content: '' };
  }

  if (contentType === 'image') {
    // The backend prepends the data-URL prefix.
    const content = await ipcBridge.fs.readContent.invoke({ file: fileRef, encoding: 'dataurl' });
    return { ...base, content: content ?? '' };
  }

  const content = await Promise.race([
    ipcBridge.fs.readContent.invoke({ file: fileRef, encoding: 'utf8' }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('File read timeout')), TEXT_READ_TIMEOUT_MS)),
  ]);
  return { ...base, content: content ?? '' };
};
