/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decide whether to show the download button in the preview toolbar.
 *
 * For files already on disk (hasFilePath), downloading a copy is redundant.
 * This applies to both code and markdown previews; synthetic content
 * (e.g. a mermaid diagram opened in the panel, with no file_path) still
 * offers download.
 *
 * @param contentType - The preview tab content type
 * @param hasFilePath - Whether the tab is backed by a file on disk
 */
export const shouldShowDownload = (contentType: string, hasFilePath: boolean): boolean => {
  if ((contentType === 'code' || contentType === 'markdown') && hasFilePath) {
    return false;
  }
  return true;
};
