/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

export function getSherpaPackageName(): string | null {
  const { platform, arch } = process;
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'sherpa-onnx-darwin-arm64' : 'sherpa-onnx-darwin-x64';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'sherpa-onnx-linux-arm64' : 'sherpa-onnx-linux-x64';
  }
  if (platform === 'win32') {
    return arch === 'x64' ? 'sherpa-onnx-win-x64' : null;
  }
  return null;
}

let cachedSherpaAddon: unknown = null;

export function loadSherpaAddon(): any {
  if (cachedSherpaAddon) {
    return cachedSherpaAddon;
  }

  const pkgName = getSherpaPackageName();
  if (!pkgName) {
    throw new Error(`Unsupported platform/architecture for local speech: ${process.platform}-${process.arch}`);
  }

  try {
    cachedSherpaAddon = req(pkgName);
    return cachedSherpaAddon;
  } catch (err1) {
    try {
      cachedSherpaAddon = req('sherpa-onnx');
      return cachedSherpaAddon;
    } catch {
      throw new Error(`Failed to load native speech module ${pkgName}: ${String(err1)}`);
    }
  }
}

export function isSherpaSupported(): boolean {
  try {
    loadSherpaAddon();
    return true;
  } catch {
    return false;
  }
}
