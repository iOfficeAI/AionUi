/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** MIME type map keyed by lowercase file extension, for binary file downloads. */
export const BINARY_MIME_MAP: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  odp: 'application/vnd.oasis.opendocument.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  odt: 'application/vnd.oasis.opendocument.text',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
};

/**
 * Decode a base64 data URL into a Blob.
 *
 * Uses in-memory atob() decoding instead of fetch() to avoid CSP connect-src
 * restrictions that block `fetch('data:...')` in WebUI mode.
 */
export function base64ToBlob(dataUrl: string, mimeType: string): Blob {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
