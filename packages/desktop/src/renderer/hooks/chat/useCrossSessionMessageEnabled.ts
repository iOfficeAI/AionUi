/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';

/**
 * The cross-session messaging master switch, read from `system_settings`.
 *
 * Defaults to `true` and stays `true` on a read failure: the switch is an
 * opt-out panic button (spec §5.7 / §6.9.2), so a transient error must not make
 * the feature look broken. The backend enforces the real gate — this value only
 * decides whether the `@@` entry point is offered.
 */
export function useCrossSessionMessageEnabled(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  refresh: () => void;
} {
  const [enabled, setEnabledState] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ipcBridge.systemSettings.getCrossSessionMessageEnabled
      .invoke()
      .then((settings) => {
        if (cancelled || settings?.cross_session_message_enabled === undefined) return;
        setEnabledState(settings.cross_session_message_enabled);
      })
      .catch(() => {
        // Leave the default (on) in place.
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const setEnabled = useCallback(async (next: boolean) => {
    // Optimistic: the switch should feel immediate, and the backend is the
    // authority for delivery regardless of what this local flag says.
    setEnabledState(next);
    try {
      await ipcBridge.systemSettings.setCrossSessionMessageEnabled.invoke({ enabled: next });
    } catch (error) {
      // Roll back so the UI never claims a state the backend rejected.
      setEnabledState(!next);
      throw error;
    }
  }, []);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { enabled, setEnabled, refresh };
}
