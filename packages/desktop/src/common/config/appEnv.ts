/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformServices } from '@/common/platform';

/**
 * Returns baseName unchanged in release builds, or baseName + '-dev' in dev builds.
 * When CSBU_WORKMATE_MULTI_INSTANCE=1, appends '-2' to isolate the second dev instance.
 * Used to isolate symlink and directory names between environments.
 *
 * @example
 * getEnvAwareName('.csbu-workmate')        // release → '.csbu-workmate',        dev → '.csbu-workmate-dev'
 * getEnvAwareName('.csbu-workmate-config') // release → '.csbu-workmate-config', dev → '.csbu-workmate-config-dev'
 * // with CSBU_WORKMATE_MULTI_INSTANCE=1:  dev → '.csbu-workmate-dev-2'
 */
export function getEnvAwareName(baseName: string): string {
  if (getPlatformServices().paths.isPackaged() === true) return baseName;
  const suffix = process.env.CSBU_WORKMATE_MULTI_INSTANCE === '1' ? '-dev-2' : '-dev';
  return `${baseName}${suffix}`;
}
