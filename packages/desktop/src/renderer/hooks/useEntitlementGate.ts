/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads the Command EVE registration/license gate status from the main process
 * (W11 `command-eve.entitlement-status` bridge) and exposes whether the gate
 * must block the app right now.
 *
 * The truth is always the main process: this hook never decides entitlement on
 * its own. It only mirrors `getEntitlementStatus` and offers a `refresh()` so
 * the gate UI can re-read after a successful activation.
 *
 * Fail-closed when required: if the status call throws or the build is not the
 * Electron desktop (no bridge), but the gate flag is on, we cannot prove
 * entitlement — however, the gate only renders in the Electron desktop shell
 * (the only place the bridge exists), so in non-desktop/webui builds the gate
 * is reported as not-required and never blocks the existing WebUI flow.
 */

import { useCallback, useEffect, useState } from 'react';
import { commandEve, type ICommandEveEntitlementStatusResult } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@renderer/utils/platform';

export interface EntitlementGateState {
  /** True until the first status read resolves. */
  loading: boolean;
  /** Latest main-process status, or null before the first read / non-desktop. */
  status: ICommandEveEntitlementStatusResult | null;
  /** Whether the gate must block all main surfaces right now. */
  blocked: boolean;
  /** Re-read the main-process status (call after a successful activation). */
  refresh: () => Promise<void>;
}

export function useEntitlementGate(): EntitlementGateState {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ICommandEveEntitlementStatusResult | null>(null);

  const refresh = useCallback(async () => {
    // The gate bridge only exists in the Electron desktop shell. In the WebUI
    // build there is no local entitlement store, so the gate never applies.
    if (!isElectronDesktop()) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      const response = await commandEve.entitlementStatus.invoke();
      setStatus(response.data ?? null);
    } catch (error) {
      console.error('Entitlement status bridge call failed:', error);
      // Bridge failure while the desktop shell is up: surface a fail-closed
      // 'unconfigured' status so the gate shows the operator a distinct,
      // non-bypassable error rather than silently unlocking.
      setStatus({
        version: 'command-eve-entitlement/v0',
        ok: false,
        required: true,
        state: 'unconfigured',
        reason_code: 'ENTITLEMENT_STATUS_UI_FAILED',
        message: error instanceof Error ? error.message : 'Entitlement status could not be read.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Block only when the main process says the gate is required AND not entitled.
  // `required:false` (flag off / non-desktop) never blocks. `ok:true` with
  // state 'entitled' is the only unlocked state.
  // `=== true` on the unblock condition: a forged ok:"yes"/ok:1 with state 'entitled'
  // must never unblock. `required` truthy already errs toward blocking (safe direction).
  const blocked = Boolean(status && status.required && !(status.ok === true && status.state === 'entitled'));

  return { loading, status, blocked, refresh };
}
