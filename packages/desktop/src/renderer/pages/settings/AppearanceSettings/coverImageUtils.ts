/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helpers for turning a user-picked theme cover image into a data URL.
 *
 * Theme covers are a purely client-side concept: the image is embedded as a
 * base64 data URL in the theme CSS/config and only used to render a local
 * preview and background. It must therefore be read in the renderer via the
 * browser File API — routing it through the backend (`fs.getImageBase64`) fails
 * for any file outside the workspace sandbox (403 PATH_OUTSIDE_SANDBOX), which
 * is where users normally keep their pictures (Desktop, Downloads, other disks).
 */

/**
 * Maximum accepted cover image size. The picked file is embedded as a base64
 * data URL (~33% larger) inside the persisted theme config, so keep the source
 * modest to avoid bloating settings storage and the rendered CSS.
 */
export const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;

export type CoverImageValidation = { ok: true } | { ok: false; reason: 'type' | 'size' };

/**
 * Validate a picked file before reading it: must be an image and within the
 * size cap. Kept pure (only reads `type`/`size`) so it is trivially testable.
 */
export const validateCoverImageFile = (file: Pick<File, 'type' | 'size'>): CoverImageValidation => {
  if (!file.type || !file.type.startsWith('image/')) {
    return { ok: false, reason: 'type' };
  }
  if (file.size > MAX_COVER_IMAGE_BYTES) {
    return { ok: false, reason: 'size' };
  }
  return { ok: true };
};

/**
 * Read an image File into a base64 data URL using the browser File API.
 * Rejects if the read fails or yields a non-string result.
 */
export const readImageFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const { result } = reader;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected FileReader result'));
      }
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read image file')));
    try {
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Failed to read image file'));
    }
  });
