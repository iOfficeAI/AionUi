/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ChatFileRef } from '@/common/types/chatFile';
import { buildFileStreamUrl } from './fileUrls';
import { base64ToBlob, BINARY_MIME_MAP } from './base64';

function triggerBlobDownload(blob: Blob, file_name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file_name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download a file by reading its raw bytes from disk (works in both Electron and WebUI).
 * Uses getImageBase64 + in-memory atob decode to bypass CSP connect-src restrictions.
 */
export async function downloadFileFromPath(file_path: string, file_name: string, workspace?: string): Promise<void> {
  const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: file_path, workspace });
  if (!dataUrl) {
    throw new Error('File data not found');
  }
  const ext = file_name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = BINARY_MIME_MAP[ext] ?? 'application/octet-stream';
  const blob = base64ToBlob(dataUrl, mimeType);
  triggerBlobDownload(blob, file_name);
}

/**
 * Download a file addressed by its renderer-safe file reference.
 *
 * Fetch the backend's raw byte stream rather than carrying the complete file as
 * base64 inside JSON. This is the same endpoint used by PDF previews and works
 * through both Electron's local backend and WebUI's same-origin reverse proxy.
 */
export async function downloadFileFromRef(file: ChatFileRef, file_name: string): Promise<void> {
  const response = await fetch(buildFileStreamUrl(file));
  if (!response.ok) throw new Error(`File download failed (${response.status})`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('File data is empty');
  triggerBlobDownload(blob, file_name);
}

/**
 * Download in-memory text content as a file.
 */
export function downloadTextContent(content: string, file_name: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, file_name);
}
