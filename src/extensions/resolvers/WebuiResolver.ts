/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedExtension, ExtWebui } from '../types';

export type WebuiContribution = {
  config: ExtWebui;
  directory: string;
};

export function resolveWebuiContributions(extensions: LoadedExtension[]): WebuiContribution[] {
  const result: WebuiContribution[] = [];
  for (const ext of extensions) {
    const webui = ext.manifest.contributes.webui;
    if (webui) {
      result.push({ config: webui, directory: ext.directory });
    }
  }
  return result;
}
