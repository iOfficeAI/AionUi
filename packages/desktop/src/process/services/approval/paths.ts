/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { getPlatformServices } from '@/common/platform';

export const CHISL_APPROVAL_DB_FILENAME = 'chisl-approval.db';

export function resolveChislApprovalDbPath(dataDir = getPlatformServices().paths.getDataDir()): string {
  return path.join(dataDir, CHISL_APPROVAL_DB_FILENAME);
}
