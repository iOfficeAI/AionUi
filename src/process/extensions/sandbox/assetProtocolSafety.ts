/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isPathWithinDirectory } from './pathSafety';

export function isAllowedAssetPath(assetPath: string, allowedRoots: readonly string[]): boolean {
  if (allowedRoots.length === 0) {
    return false;
  }

  return allowedRoots.some((root) => isPathWithinDirectory(assetPath, root));
}
