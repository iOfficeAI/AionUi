/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global voice-input hotkey (MVP: press to start recording, press again to
 * stop). The renderer owns the actual start/stop logic and toggles on the
 * `speech.hotkeyPressed` event this module emits. Registration is fully
 * driven by the renderer via `speech.configureHotkey` so the main process
 * stays a dumb receiver — and nothing is registered when the feature is
 * disabled, keeping behavior identical to the original build.
 */

import { app, globalShortcut } from 'electron';

import { bridge } from '@/common/platform/bridge';

export type SpeechHotkeyConfig = {
  enabled: boolean;
  accelerator: string;
};

let registeredAccelerator: string | null = null;
let configOff: (() => void) | null = null;
let beforeQuitHandler: (() => void) | null = null;

const handleHotkeyPress = (): void => {
  // Renderer decides start vs stop based on its own recording state.
  bridge.emit('speech.hotkeyPressed', { type: 'toggle' });
};

/**
 * (Re)register the global shortcut for the given config. Idempotent: an
 * existing registration is unregistered first, so repeated calls are safe.
 * Returns true when the shortcut is now actively registered.
 */
export const applySpeechHotkey = (config: SpeechHotkeyConfig): boolean => {
  if (registeredAccelerator) {
    try {
      globalShortcut.unregister(registeredAccelerator);
    } catch {
      // best-effort cleanup
    }
    registeredAccelerator = null;
  }

  if (!config.enabled || !config.accelerator) {
    return false;
  }

  let registered = false;
  try {
    registered = globalShortcut.register(config.accelerator, handleHotkeyPress);
  } catch (error) {
    console.error('[speechHotkey] Failed to register global shortcut:', error);
    registered = false;
  }

  if (!registered) {
    console.warn(
      `[speechHotkey] Could not register "${config.accelerator}" (already taken or invalid). Hotkey disabled.`
    );
    registeredAccelerator = null;
    return false;
  }

  registeredAccelerator = config.accelerator;
  return true;
};

export const disposeSpeechHotkey = (): void => {
  if (registeredAccelerator) {
    try {
      globalShortcut.unregister(registeredAccelerator);
    } catch {
      // ignore
    }
    registeredAccelerator = null;
  }
  if (beforeQuitHandler) {
    app.removeListener('before-quit', beforeQuitHandler);
    beforeQuitHandler = null;
  }
  if (configOff) {
    configOff();
    configOff = null;
  }
};

/**
 * Wire the renderer→main `speech.configureHotkey` listener and a before-quit
 * cleanup. The renderer is responsible for (re)sending the config; on startup
 * it emits the current setting, and again whenever the user changes it.
 */
export const initSpeechHotkey = (): void => {
  configOff = bridge.on('speech.configureHotkey', (raw) => {
    const config = (raw ?? { enabled: false, accelerator: '' }) as SpeechHotkeyConfig;
    applySpeechHotkey({
      enabled: Boolean(config.enabled),
      accelerator: config.accelerator ?? '',
    });
  });

  // Unregister the global shortcut on quit so it does not leak across restarts.
  beforeQuitHandler = (): void => {
    if (registeredAccelerator) {
      try {
        globalShortcut.unregister(registeredAccelerator);
      } catch {
        // ignore
      }
      registeredAccelerator = null;
    }
  };
  app.on('before-quit', beforeQuitHandler);
};
