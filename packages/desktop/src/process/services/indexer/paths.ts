/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { getPlatformServices } from '@/common/platform';

export const CHISL_INDEX_DB_FILENAME = 'chisl-index.db';

export function resolveChislIndexDbPath(dataDir = getPlatformServices().paths.getDataDir()): string {
  return path.join(dataDir, CHISL_INDEX_DB_FILENAME);
}
