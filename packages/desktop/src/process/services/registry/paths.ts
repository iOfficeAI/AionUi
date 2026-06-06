/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { getPlatformServices } from '@/common/platform';

export const CHISL_SERVERS_FILENAME = 'chisl-servers.json' as const;

export function resolveChislServersJsonPath(dataDir = getPlatformServices().paths.getDataDir()): string {
  return path.join(dataDir, CHISL_SERVERS_FILENAME);
}
