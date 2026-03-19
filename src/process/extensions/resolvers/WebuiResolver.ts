/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtWebui } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { resolveRuntimeEntryPath } from './utils/entryPointResolver';

export type WebuiContribution = {
  config: ExtWebui;
  directory: string;
  extensionName?: string;
};

export function resolveWebuiContributions(extensions: LoadedExtension[]): WebuiContribution[] {
  const result: WebuiContribution[] = [];
  const seenApiRoutes = new Set<string>();
  const seenAssetPrefixes = new Set<string>();
  for (const ext of extensions) {
    const webui = ext.manifest.contributes.webui;
    if (!webui) continue;

    const validated = validateWebuiContribution(webui, ext, seenApiRoutes, seenAssetPrefixes);
    if (validated) {
      result.push({ config: validated, directory: ext.directory, extensionName: ext.manifest.name });
    }
  }
  return result;
}

function normalizeWebuiPath(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isReservedWebuiPath(pathname: string): boolean {
  const reserved = ['/', '/api', '/login', '/logout', '/qr-login', '/static', '/assets'];
  return reserved.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isNamespacedForExtension(pathname: string, extensionName: string): boolean {
  const namespace = `/${extensionName}`;
  return pathname === namespace || pathname.startsWith(`${namespace}/`);
}

function validateWebuiContribution(
  webui: ExtWebui,
  ext: LoadedExtension,
  seenApiRoutes: Set<string>,
  seenAssetPrefixes: Set<string>
): ExtWebui | null {
  const extDir = ext.directory;
  const extName = ext.manifest.name;
  const sanitized: ExtWebui = {};

  if ((webui.wsHandlers && webui.wsHandlers.length > 0) || (webui.middleware && webui.middleware.length > 0)) {
    console.warn(`[Extensions] WebUI wsHandlers/middleware are declared but not yet supported at runtime: ${extName}`);
  }

  // Validate API route entryPoints exist
  if (webui.apiRoutes) {
    const validApiRoutes: NonNullable<ExtWebui['apiRoutes']> = [];
    for (const route of webui.apiRoutes) {
      const routePath = normalizeWebuiPath(route.path);
      if (!routePath) {
        console.warn(`[Extensions] WebUI API route has empty path in ${extName}, skipping`);
        continue;
      }
      if (!isNamespacedForExtension(routePath, extName) || isReservedWebuiPath(routePath)) {
        console.warn(
          `[Extensions] WebUI API route must be namespaced under "/${extName}" and avoid reserved prefixes: ${routePath}`
        );
        continue;
      }
      if (seenApiRoutes.has(routePath)) {
        console.warn(`[Extensions] Duplicate WebUI API route across extensions: ${routePath}, skipping (${extName})`);
        continue;
      }
      const absPath = resolveRuntimeEntryPath(extDir, route.entryPoint);
      if (!absPath) {
        const rawPath = path.resolve(extDir, route.entryPoint);
        if (!isPathWithinDirectory(rawPath, extDir)) {
          console.warn(
            `[Extensions] WebUI API route path traversal attempt: ${route.entryPoint} in ${extName}, skipping`
          );
          continue;
        }
        console.warn(
          `[Extensions] WebUI API route entryPoint not found (dist/source): ${route.entryPoint} (extension: ${extName}), skipping`
        );
        continue;
      }
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(
          `[Extensions] WebUI API route path traversal attempt: ${route.entryPoint} in ${extName}, skipping`
        );
        continue;
      }
      validApiRoutes.push({ ...route, path: routePath, entryPoint: absPath });
      seenApiRoutes.add(routePath);
    }
    if (validApiRoutes.length > 0) sanitized.apiRoutes = validApiRoutes;
  }

  // Validate WebSocket handler entryPoints exist
  if (webui.wsHandlers) {
    for (const handler of webui.wsHandlers) {
      const absPath = resolveRuntimeEntryPath(extDir, handler.entryPoint);
      if (!absPath) {
        const rawPath = path.resolve(extDir, handler.entryPoint);
        if (!isPathWithinDirectory(rawPath, extDir)) {
          console.warn(`[Extensions] WebUI WS handler path traversal attempt: ${handler.entryPoint} in ${extName}`);
          continue;
        }
        console.warn(
          `[Extensions] WebUI WS handler entryPoint not found (dist/source): ${handler.entryPoint} (extension: ${extName})`
        );
        continue;
      }
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(`[Extensions] WebUI WS handler path traversal attempt: ${handler.entryPoint} in ${extName}`);
        continue;
      }
    }
  }

  // Validate middleware entryPoints exist
  if (webui.middleware) {
    for (const mw of webui.middleware) {
      const absPath = resolveRuntimeEntryPath(extDir, mw.entryPoint);
      if (!absPath) {
        const rawPath = path.resolve(extDir, mw.entryPoint);
        if (!isPathWithinDirectory(rawPath, extDir)) {
          console.warn(`[Extensions] WebUI middleware path traversal attempt: ${mw.entryPoint} in ${extName}`);
          continue;
        }
        console.warn(
          `[Extensions] WebUI middleware entryPoint not found (dist/source): ${mw.entryPoint} (extension: ${extName})`
        );
        continue;
      }
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(`[Extensions] WebUI middleware path traversal attempt: ${mw.entryPoint} in ${extName}`);
        continue;
      }
    }
  }

  // Validate static asset directories exist
  if (webui.staticAssets) {
    const validStaticAssets: NonNullable<ExtWebui['staticAssets']> = [];
    for (const asset of webui.staticAssets) {
      const urlPrefix = normalizeWebuiPath(asset.urlPrefix);
      if (!urlPrefix) {
        console.warn(`[Extensions] WebUI static asset has empty urlPrefix in ${extName}, skipping`);
        continue;
      }
      if (!isNamespacedForExtension(urlPrefix, extName) || isReservedWebuiPath(urlPrefix)) {
        console.warn(
          `[Extensions] WebUI static asset prefix must be namespaced under "/${extName}" and avoid reserved prefixes: ${urlPrefix}`
        );
        continue;
      }
      if (seenAssetPrefixes.has(urlPrefix)) {
        console.warn(
          `[Extensions] Duplicate WebUI static asset prefix across extensions: ${urlPrefix}, skipping (${extName})`
        );
        continue;
      }
      const absPath = path.resolve(extDir, asset.directory);
      if (!isPathWithinDirectory(absPath, extDir)) {
        console.warn(
          `[Extensions] WebUI static asset path traversal attempt: ${asset.directory} in ${extName}, skipping`
        );
        continue;
      }
      if (!existsSync(absPath)) {
        console.warn(
          `[Extensions] WebUI static asset directory not found: ${absPath} (extension: ${extName}), skipping`
        );
        continue;
      }
      validStaticAssets.push({ ...asset, urlPrefix });
      seenAssetPrefixes.add(urlPrefix);
    }
    if (validStaticAssets.length > 0) sanitized.staticAssets = validStaticAssets;
  }

  if (!sanitized.apiRoutes && !sanitized.staticAssets) {
    return null;
  }

  return sanitized;
}
