/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtWebui } from '../types';
import { isPathWithinDirectory } from '../pathSafety';

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

function validateWebuiContribution(webui: ExtWebui, ext: LoadedExtension): ExtWebui | null {
  const extDir = ext.directory;
  const extName = ext.manifest.name;

  // Validate API route entryPoints exist
  if (webui.apiRoutes) {
    for (const route of webui.apiRoutes) {
      const absPath = path.resolve(extDir, route.entryPoint);
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(`[Extensions] WebUI API route path traversal attempt: ${route.entryPoint} in ${extName}`);
        return null;
      }
      if (!existsSync(absPath)) {
        console.warn(`[Extensions] WebUI API route entryPoint not found: ${absPath} (extension: ${extName})`);
        return null;
      }
    }
  }

  // Validate WebSocket handler entryPoints exist
  if (webui.wsHandlers) {
    for (const handler of webui.wsHandlers) {
      const absPath = path.resolve(extDir, handler.entryPoint);
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(`[Extensions] WebUI WS handler path traversal attempt: ${handler.entryPoint} in ${extName}`);
        return null;
      }
      if (!existsSync(absPath)) {
        console.warn(`[Extensions] WebUI WS handler entryPoint not found: ${absPath} (extension: ${extName})`);
        return null;
      }
    }
  }

  // Validate middleware entryPoints exist
  if (webui.middleware) {
    for (const mw of webui.middleware) {
      const absPath = path.resolve(extDir, mw.entryPoint);
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(`[Extensions] WebUI middleware path traversal attempt: ${mw.entryPoint} in ${extName}`);
        return null;
      }
      if (!existsSync(absPath)) {
        console.warn(`[Extensions] WebUI middleware entryPoint not found: ${absPath} (extension: ${extName})`);
        return null;
      }
    }
  }

  // Validate static asset directories exist
  if (webui.staticAssets) {
    for (const asset of webui.staticAssets) {
      const absPath = path.resolve(extDir, asset.directory);
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(`[Extensions] WebUI static asset path traversal attempt: ${asset.directory} in ${extName}`);
        return null;
      }
      if (!existsSync(absPath)) {
        console.warn(`[Extensions] WebUI static asset directory not found: ${absPath} (extension: ${extName})`);
        return null;
      }
    }
  }

  return webui;
}
