/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewContentType } from '../../types';

export type DefaultOpenMode = 'edit' | 'source' | null;

export interface GetDefaultOpenModeInput {
  contentType: PreviewContentType;
  isEditable: boolean;
}

/**
 * Decide which mode the active tab should open in automatically.
 */
export function getDefaultOpenMode({ contentType, isEditable }: GetDefaultOpenModeInput): DefaultOpenMode {
  if (!isEditable) return null;
  if (contentType === 'code') return 'edit';
  if (contentType === 'markdown' || contentType === 'html') return 'source';
  return null;
}
