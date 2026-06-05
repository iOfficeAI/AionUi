/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { getPlatformServices } from '@/common/platform';

export const CHISL_QUEUE_DB_FILENAME = 'chisl-queue.db';

export function resolveChislQueueDbPath(dataDir = getPlatformServices().paths.getDataDir()): string {
  return path.join(dataDir, CHISL_QUEUE_DB_FILENAME);
}
