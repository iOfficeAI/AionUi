/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type PreviewContentType =
  | 'markdown'
  | 'diff'
  | 'code'
  | 'html'
  | 'pdf'
  | 'ppt'
  | 'word'
  | 'excel'
  | 'image'
  // Plain text with a table shape. Split out of `excel` because officecli — the
  // renderer `excel` routes to — does not accept .csv at all, so every CSV opened
  // failed there while being perfectly readable as text.
  | 'csv'
  // Formats we can identify but genuinely cannot render: legacy Office binaries,
  // ODF, macro-enabled Office, and HEIC. Previously these were routed to a
  // renderer that could not open them, so they failed with a message telling the
  // user to install officecli — which would not have helped for any of them.
  | 'unsupported'
  | 'url'
  | 'browser';

export interface RemoteImageFetchRequest {
  url: string;
}
