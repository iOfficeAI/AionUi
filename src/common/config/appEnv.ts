/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformServices } from '@/common/platform';

/**
 * Returns baseName unchanged in release builds, or baseName + '-dev' in dev builds.
 * Used to isolate symlink and directory names between environments.
 *
 * @example
 * getEnvAwareName('.aionui')        // release → '.aionui',        dev → '.aionui-dev'
 * getEnvAwareName('.aionui-config') // release → '.aionui-config', dev → '.aionui-config-dev'
 */
export function getEnvAwareName(baseName: string): string {
  return getPlatformServices().paths.isPackaged() === true ? baseName : `${baseName}-dev`;
}
