/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ambient Mode bridge (M1 skeleton).
 *
 * Exposes getter/setter providers for:
 *   - ambient.getBubblePosition / ambient.setBubblePosition (AC-M1-5)
 *   - ambient.getEnabled / ambient.setEnabled (AC-M1-11)
 *
 * Pattern mirrors `systemSettingsBridge.ts`'s pet.* block. The ambient
 * window lifecycle (create / destroy) lives in `ambientWindowManager.ts`
 * — this bridge only persists config; enabling/disabling at runtime
 * defers window changes to the next app launch (AC-M1-12: mode flip
 * requires restart because frameless/transparent are construction-time).
 */

import { ipcBridge } from '@/common';
import { ProcessConfig } from '@process/utils/initStorage';
import { getPersistedBubblePosition, setBubblePosition } from '@process/ambient/ambientWindowManager';

let initialized = false;

export function initAmbientBridge(): void {
  // Idempotent: may be called twice in ambient E2E fast-path (once in
  // `app.whenReady` fast-path, once later in `initAllBridges`). Skip the
  // second call so the provider factories don't double-register.
  if (initialized) return;
  initialized = true;

  ipcBridge.ambient.getBubblePosition.provider(async () => {
    return getPersistedBubblePosition();
  });

  ipcBridge.ambient.setBubblePosition.provider(async (pos) => {
    await setBubblePosition(pos);
  });

  ipcBridge.ambient.getEnabled.provider(async () => {
    const value = await ProcessConfig.get('ambient.enabled');
    return value ?? false;
  });

  ipcBridge.ambient.setEnabled.provider(async ({ enabled }) => {
    await ProcessConfig.set('ambient.enabled', enabled);
    // AC-M1-12: mode switching requires restart; no runtime window recreate here.
  });
}
