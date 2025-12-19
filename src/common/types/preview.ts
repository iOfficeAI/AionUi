/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type PreviewContentType = 'markdown' | 'diff' | 'code' | 'html' | 'pdf' | 'ppt' | 'word' | 'excel' | 'image' | 'url';

export interface PreviewHistoryTarget {
  contentType: PreviewContentType;
  filePath?: string;
  workspace?: string;
  fileName?: string;
  title?: string;
  language?: string;
  conversationId?: string;
}

export interface PreviewSnapshotInfo {
  id: string;
  label: string;
  createdAt: number;
  size: number;
  contentType: PreviewContentType;
  fileName?: string;
  filePath?: string;
}

export interface RemoteImageFetchRequest {
  url: string;
}
