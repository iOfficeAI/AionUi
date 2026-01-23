/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

const tryCreateFromPath = (p: string) => {
  try {
    if (!fs.existsSync(p)) return null;
    const img = nativeImage.createFromPath(p);
    return img.isEmpty() ? null : img;
  } catch {
    return null;
  }
};

export const getTrayIconSyncFallback = () => {
  // Packaged: prefer our explicitly shipped tray icon.
  // Dev: prefer repo resources.
  const preferred = app.isPackaged ? (process.platform === 'win32' ? tryCreateFromPath(path.join(process.resourcesPath, 'app.ico')) : tryCreateFromPath(path.join(process.resourcesPath, 'app.png'))) : process.platform === 'win32' ? tryCreateFromPath(path.join(process.cwd(), 'resources', 'app.ico')) : tryCreateFromPath(path.join(process.cwd(), 'resources', 'app.png'));
  if (preferred) return preferred;

  // Secondary fallback: try the other location.
  const secondary = app.isPackaged ? (process.platform === 'win32' ? tryCreateFromPath(path.join(process.cwd(), 'resources', 'app.ico')) : tryCreateFromPath(path.join(process.cwd(), 'resources', 'app.png'))) : process.platform === 'win32' ? tryCreateFromPath(path.join(process.resourcesPath, 'app.ico')) : tryCreateFromPath(path.join(process.resourcesPath, 'app.png'));
  if (secondary) return secondary;

  return nativeImage.createEmpty();
};

// Returns a best-effort tray icon without embedding base64.
// Uses the packaged app icon first; falls back to local repo resources in dev.
export const getTrayIcon = () => {
  return getTrayIconSyncFallback();
};
