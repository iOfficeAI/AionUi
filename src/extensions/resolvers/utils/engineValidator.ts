/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedExtension } from '../../types';
import fs from 'fs';
import path from 'path';

/**
 * Current AionUI extension API version.
 * Increment major for breaking changes, minor for new features, patch for fixes.
 */
export const AIONUI_VERSION = getAionUIVersion();
export const EXTENSION_API_VERSION = '1.0.0';

type ParsedVersion = { major: number; minor: number; patch: number };

function parseVersion(version: string): ParsedVersion | null {
  const clean = version.replace(/^[\^~]/, '');
  const parts = clean.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

function satisfiesVersion(version: string, range: string): boolean {
  const parsedVersion = parseVersion(version);
  const parsedRange = parseVersion(range);
  if (!parsedVersion || !parsedRange) return false;
  if (range === version) return true;

  if (range.startsWith('^')) {
    if (parsedRange.major === 0) {
      if (parsedRange.minor === 0) {
        return parsedVersion.major === 0 && parsedVersion.minor === 0 && parsedVersion.patch === parsedRange.patch;
      }
      return (
        parsedVersion.major === 0 &&
        parsedVersion.minor === parsedRange.minor &&
        parsedVersion.patch >= parsedRange.patch
      );
    }
    return (
      parsedVersion.major === parsedRange.major &&
      (parsedVersion.minor > parsedRange.minor ||
        (parsedVersion.minor === parsedRange.minor && parsedVersion.patch >= parsedRange.patch))
    );
  }
  if (range.startsWith('~')) {
    return (
      parsedVersion.major === parsedRange.major &&
      parsedVersion.minor === parsedRange.minor &&
      parsedVersion.patch >= parsedRange.patch
    );
  }

  return (
    parsedVersion.major === parsedRange.major &&
    parsedVersion.minor === parsedRange.minor &&
    parsedVersion.patch === parsedRange.patch
  );
}

/**
 * Get the AionUI version from package.json.
 * Falls back to '0.0.0' if not available.
 */
function getAionUIVersion(): string {
  // Prefer Electron runtime version when available (desktop / packaged mode).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: { getVersion?: () => string } };
    const appVersion = electron?.app?.getVersion?.();
    if (appVersion) return appVersion;
  } catch {
    // Ignore: non-Electron contexts (unit tests, node scripts)
  }

  // Fallback to nearest package.json candidates in dev/build contexts.
  const candidates = [
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../../../package.json'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const pkg = require(candidate) as { version?: string };
      if (pkg?.version) return pkg.version;
    } catch {
      // Continue trying next candidate
    }
  }

  try {
    return process.env.npm_package_version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface EngineValidationResult {
  valid: boolean;
  extensionName: string;
  issues: string[];
}

/**
 * Validate that an extension's engine requirements are satisfied by the current AionUI version.
 *
 * Checks:
 * 1. engine.aionui — does the running AionUI version satisfy the required range?
 * 2. engine.extensionApi — (future) does the extension API version match?
 */
export function validateEngineCompatibility(extension: LoadedExtension): EngineValidationResult {
  const result: EngineValidationResult = {
    valid: true,
    extensionName: extension.manifest.name,
    issues: [],
  };

  const engine = extension.manifest.engine;
  const apiVersion = extension.manifest.apiVersion;

  // Check AionUI core version compatibility
  if (engine?.aionui) {
    if (!satisfiesVersion(AIONUI_VERSION, engine.aionui)) {
      result.valid = false;
      result.issues.push(
        `Extension "${extension.manifest.name}" requires AionUI ${engine.aionui} but current version is ${AIONUI_VERSION}`
      );
    }
  }

  // Check extension API version compatibility
  if (apiVersion) {
    if (!satisfiesVersion(EXTENSION_API_VERSION, apiVersion)) {
      result.valid = false;
      result.issues.push(
        `Extension "${extension.manifest.name}" requires extension API ${apiVersion} but current API is ${EXTENSION_API_VERSION}`
      );
    }
  }

  return result;
}

/**
 * Validate engine compatibility for all extensions.
 * Returns extensions that pass validation and logs warnings for those that don't.
 */
export function filterByEngineCompatibility(extensions: LoadedExtension[]): {
  compatible: LoadedExtension[];
  incompatible: Array<{ extension: LoadedExtension; issues: string[] }>;
} {
  const compatible: LoadedExtension[] = [];
  const incompatible: Array<{ extension: LoadedExtension; issues: string[] }> = [];

  for (const ext of extensions) {
    const result = validateEngineCompatibility(ext);
    if (result.valid) {
      compatible.push(ext);
    } else {
      incompatible.push({ extension: ext, issues: result.issues });
      for (const issue of result.issues) {
        console.warn(`[Extensions] Engine incompatibility: ${issue}`);
      }
    }
  }

  return { compatible, incompatible };
}
