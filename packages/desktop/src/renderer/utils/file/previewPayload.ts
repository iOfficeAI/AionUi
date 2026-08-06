/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { PreviewContentType } from '@/common/types/office/preview';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';

/**
 * Default size gate for text-like previews (markdown / html / code / diff / csv),
 * in **whole megabytes** — the unit the settings field uses.
 *
 * Above this the file is not read at all: CodeMirror state construction grows
 * super-linearly with document size, and — more importantly — a partially read
 * document must never reach an editor that can save, or saving destroys the
 * unread remainder.
 *
 * User-configurable via `preview.textSizeLimitMb` (settings → system). This is the
 * value used when that setting has never been set or holds something unusable.
 */
export const DEFAULT_TEXT_PREVIEW_LIMIT_MB = 1;

/**
 * Bounds accepted for the configured limit, in MB.
 *
 * The lower bound is 1 rather than 0: a limit of 0 would make *every* file
 * oversized, turning the preview panel off entirely through a field that does not
 * say so. The upper bound keeps a mistyped value (say a pasted byte count) from
 * disabling the gate the setting exists to control.
 */
export const MIN_TEXT_PREVIEW_LIMIT_MB = 1;
export const MAX_TEXT_PREVIEW_LIMIT_MB = 100;

const BYTES_PER_MB = 1024 * 1024;

/**
 * Size gate for images, deliberately far higher than the text one: 1MB is small
 * for a photo, while an image is read as a data URL (whole file in memory, ~33%
 * base64 inflation), so it still needs a ceiling.
 *
 * Not configurable: the text limit exists because *editing* a huge document is the
 * problem, and images are never edited here.
 */
const IMAGE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Timeout for text content reads, so a stuck read cannot leave the panel
 * hanging. Only text is guarded: an image data URL of a near-limit file is tens
 * of megabytes and legitimately slower, and images were never guarded before.
 */
const TEXT_READ_TIMEOUT_MS = 5000;

/**
 * Types rendered without reading content: pdf loads from the stream URL, office
 * resolves the ref server-side for its own watch, and `unsupported` has nothing to
 * render at all (it shows an explanation plus the escape hatch). They carry no
 * editable content, so no size gate applies either.
 */
const CONTENT_FREE_TYPES = new Set<PreviewContentType>(['pdf', 'word', 'excel', 'ppt', 'unsupported']);

/**
 * Normalize a stored/entered MB limit into a usable one.
 *
 * Pure and total: every input maps to a number inside the accepted bounds, so no
 * caller has to decide what a bad value means. Anything that is not a finite
 * number — `undefined` (never configured), `null` from storage, `NaN` from an
 * emptied input — falls back to the default rather than to 0, because 0 would gate
 * off every file.
 *
 * Fractional entries are kept (1.5 MB is a reasonable thing to want) but rounded
 * to a whole number of bytes downstream by the multiplication.
 */
export const normalizeTextPreviewLimitMb = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TEXT_PREVIEW_LIMIT_MB;
  return Math.min(MAX_TEXT_PREVIEW_LIMIT_MB, Math.max(MIN_TEXT_PREVIEW_LIMIT_MB, value));
};

/** Convert a normalized MB limit to the byte count the size check compares against. */
export const textPreviewLimitBytes = (limitMb: unknown): number =>
  Math.round(normalizeTextPreviewLimitMb(limitMb) * BYTES_PER_MB);

/**
 * Size ceiling for a content type, or `undefined` when the type has no gate.
 *
 * `textLimitBytes` is passed in rather than read here: it is a snapshot taken once
 * when the tab opens (see {@link resolvePreviewPayload}), so that changing the
 * setting later cannot reclassify a tab already on screen.
 */
const thresholdBytesFor = (contentType: PreviewContentType, textLimitBytes: number): number | undefined => {
  if (CONTENT_FREE_TYPES.has(contentType)) return undefined;
  return contentType === 'image' ? IMAGE_PREVIEW_MAX_BYTES : textLimitBytes;
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
 * # Why the limit is read here and nowhere else
 *
 * The text ceiling is a user setting, and it is read **once, at open time**, then
 * carried on the tab as `thresholdBytes`. Reading it at render time instead would
 * let changing the setting reclassify tabs already on screen: a file being edited
 * would flip to "too large, open it in a system editor" mid-edit, and lowering the
 * limit would strand content the user had not saved. Snapshotting keeps the
 * documented semantics — **a changed limit applies to newly opened tabs only**.
 *
 * A failed settings read is not an error here: it falls back to the default
 * ceiling, because refusing to open a file over an unreadable preference would be a
 * worse outcome than gating it at 1 MB.
 *
 * @param fileRef     Identity to read — resolution to a path stays in the backend.
 * @param contentType Decides the read encoding and which ceiling applies.
 */
export const resolvePreviewPayload = async (
  fileRef: ChatFileRef,
  contentType: PreviewContentType
): Promise<PreviewPayload> => {
  // Snapshot the configured ceiling alongside the stat, before anything is read.
  // Both are per-open facts; neither is re-read for the life of the tab.
  const [metadata, storedLimitMb] = await Promise.all([
    // Throws when the file is missing — callers map that to their own fallback.
    ipcBridge.fs.getContentMetadata.invoke({ file: fileRef }),
    getClientBusinessSetting('preview.textSizeLimitMb').catch((): number | undefined => undefined),
  ]);

  const sizeBytes = metadata.size;
  const thresholdBytes = thresholdBytesFor(contentType, textPreviewLimitBytes(storedLimitMb));
  // `>` not `>=`: a file of exactly the limit is within it, not over it.
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

/**
 * Format a byte count for the oversized notice, guaranteeing it reads as larger
 * than `limitBytes`.
 *
 * The plain formatter rounds to 2 decimals, so a file one byte over a 1 MB ceiling
 * renders as "1 MB" — and the message became "1 MB exceeds 1 MB", which reads as a
 * bug in the app rather than an explanation. Since the caller only reaches this
 * when the file genuinely is larger, showing two equal numbers is always wrong.
 *
 * Adds precision only when needed, then falls back to an explicit "more than"
 * phrasing for differences too small to render at any sane precision.
 *
 * @param bytes      Actual file size.
 * @param limitBytes The ceiling it exceeded.
 * @param format     Byte formatter (injected so this stays pure and testable).
 */
export const formatSizeAboveLimit = (
  bytes: number,
  limitBytes: number,
  format: (value: number, decimals?: number) => string
): string => {
  const limitText = format(limitBytes);
  // Try increasing precision until the two values are visibly different.
  for (const decimals of [2, 3, 4]) {
    const sizeText = format(bytes, decimals);
    if (sizeText !== limitText) return sizeText;
  }
  // Differences under ~0.0001 of a unit: state the relationship instead of a
  // number that would still round to the limit.
  return `> ${limitText}`;
};

/**
 * Resolve a file ref to the strongest identity available before opening it.
 *
 * The explorer and a chat link describe the same file differently — a project ref
 * versus an absolute local path — so without this, one file becomes two tabs and
 * only one of them can receive change signals. The backend decides, because whether
 * two paths are "the same" depends on case-folding rules that vary per platform.
 *
 * Best-effort by design. When there is no current project, or the request fails,
 * the original ref is returned and the file simply opens without the extras a
 * project identity brings (dedup against another entry point, automatic refresh
 * signals). That is the same position `upload` and outside-any-root files are
 * already in, so it degrades into an existing, handled state rather than an error.
 *
 * @param fileRef   Ref as the entry point built it.
 * @param projectId Current project, or null when there is none.
 */
export const upgradeFileRef = async (fileRef: ChatFileRef, projectId: string | null): Promise<ChatFileRef> => {
  // A project ref is already terminal and an upload belongs to no root; the backend
  // short-circuits both, so skipping the round trip here just avoids paying for an
  // answer we know. Explorer opens take this path.
  if (!projectId || fileRef.kind !== 'local') return fileRef;

  try {
    const { file } = await ipcBridge.project.resolveRef.invoke({ project_id: projectId, file: fileRef });
    return file;
  } catch {
    return fileRef;
  }
};
