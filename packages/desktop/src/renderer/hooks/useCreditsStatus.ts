/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads the Command EVE credits-status from the main process (Lane-1
 * `command-eve.credits-status` bridge) and builds the live meter view-model.
 *
 * Mirrors `useEntitlementGate`: the truth is always the main process (which
 * holds the CEVE bearer and calls the credits-status Edge Function). This hook
 * never decides balances — it polls, builds the meter model via the pure
 * `creditsCore`, and offers `setSpendCap` + `refresh`.
 *
 * The meter is LIVE: it refreshes on an interval and on demand (after a job
 * completes / a pack is bought). In non-desktop (WebUI) builds there is no
 * bridge, so the hook reports no status and the meter renders nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commandEve,
  type ICommandEveCreditsStatusResult,
} from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@renderer/utils/platform';
import {
  buildCreditMeterModel,
  validateSpendCapEur,
  type CreditMeterModel,
  type CreditsStatus,
} from '@/common/config/creditsCore';

/** Default live-meter poll interval (ms). 60s keeps it fresh without hammering. */
export const CREDITS_POLL_INTERVAL_MS = 60_000;

export interface CreditsStatusState {
  /** True until the first status read resolves. */
  loading: boolean;
  /** Latest credits-status from the main process, or null before first read / non-desktop. */
  status: ICommandEveCreditsStatusResult | null;
  /** The derived meter view-model (null until a status is read). */
  meter: CreditMeterModel | null;
  /** Re-read the credits status now (call after a job completes / a pack buy). */
  refresh: () => Promise<void>;
  /**
   * Persist a new spend cap (euros; 0/null ⇒ uncapped). Validates locally via
   * the pure core, writes through the bridge, then refreshes. Returns ok/false.
   */
  setSpendCap: (eur: number | null) => Promise<boolean>;
}

/** Map the bridge result onto the pure-core CreditsStatus shape. */
function toCoreStatus(result: ICommandEveCreditsStatusResult): CreditsStatus {
  return {
    tier: result.tier,
    included_allowance_credits_remaining: result.included_allowance_credits_remaining,
    purchased_credits_remaining: result.purchased_credits_remaining,
    spend_cap_eur_cents: result.spend_cap_eur_cents,
    free_actions_used_this_period: result.free_actions_used_this_period,
    free_cap: result.free_cap,
    period_start: result.period_start,
  };
}

export function useCreditsStatus(pollIntervalMs: number = CREDITS_POLL_INTERVAL_MS): CreditsStatusState {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ICommandEveCreditsStatusResult | null>(null);
  const [meter, setMeter] = useState<CreditMeterModel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!isElectronDesktop()) {
      setStatus(null);
      setMeter(null);
      setLoading(false);
      return;
    }
    try {
      const response = await commandEve.creditsStatus.invoke();
      const data = response.data ?? null;
      setStatus(data);
      setMeter(data && data.ok ? buildCreditMeterModel(toCoreStatus(data)) : null);
    } catch (error) {
      // A read failure must NOT crash the chrome or block the app — the meter
      // simply goes quiet (null) and retries on the next interval.
      console.error('Credits status bridge call failed:', error);
      setStatus(null);
      setMeter(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const setSpendCap = useCallback(
    async (eur: number | null): Promise<boolean> => {
      const validation = validateSpendCapEur(eur);
      if (!validation.ok) return false;
      if (!isElectronDesktop()) return false;
      try {
        const response = await commandEve.creditsSetSpendCap.invoke({
          spend_cap_eur_cents: validation.eurCents,
        });
        if (response.data?.ok) {
          await refresh();
          return true;
        }
        return false;
      } catch (error) {
        console.error('Credits set-spend-cap bridge call failed:', error);
        return false;
      }
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
    if (pollIntervalMs > 0 && isElectronDesktop()) {
      timerRef.current = setInterval(() => {
        void refresh();
      }, pollIntervalMs);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refresh, pollIntervalMs]);

  return { loading, status, meter, refresh, setSpendCap };
}
