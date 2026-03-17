/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { base64ToBlob, BINARY_MIME_MAP } from './base64';

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download a file by reading its raw bytes from disk (works in both Electron and WebUI).
 * Uses getImageBase64 + in-memory atob decode to bypass CSP connect-src restrictions.
 */
export async function downloadFileFromPath(filePath: string, fileName: string): Promise<void> {
  const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: filePath });
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = BINARY_MIME_MAP[ext] ?? 'application/octet-stream';
  const blob = base64ToBlob(dataUrl, mimeType);
  triggerBlobDownload(blob, fileName);
}

/**
 * Download in-memory text content as a file.
 */
export function downloadTextContent(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, fileName);
}
