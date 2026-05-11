/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Substring from the base64-encoded "Image not found" placeholder SVG returned by
// fsBridge.getImageBase64 when fs.readFile throws (typically ENOENT). Kept aligned
// to the base64 boundaries of ">Image not found<" inside the SVG data URL so that
// a plain substring check is enough to detect the placeholder.
export const IMAGE_NOT_FOUND_B64_MARKER = 'kltYWdlIG5vdCBmb3VuZD';

export const MAX_IMAGE_RETRIES = 5;
export const IMAGE_RETRY_DELAY_MS = 800;

export const isImageNotFoundPlaceholder = (base64: string): boolean => base64.includes(IMAGE_NOT_FOUND_B64_MARKER);
