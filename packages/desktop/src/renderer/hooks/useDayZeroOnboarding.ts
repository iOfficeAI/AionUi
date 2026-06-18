/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Day-0 client-input onboarding hook (Lane 3, spec §3).
 *
 * Decides — once, on first run — whether to FORCE the one-client-input prompt
 * that seeds the Company-Brain (the early switching-cost). The decision is the
 * PURE `creditsCore.shouldForceDayZeroOnboarding` over a persisted
 * `commandEve.clientSeeded` flag, so it never re-nags after a real seed.
 *
 * On seed it flips the persisted flag and forwards the seed to the caller-
 * provided sink (the Company-Brain memory write is Hermes/backend scope — this
 * hook records the local switching-cost flag + the seed payload, and exposes a
 * single seam for wiring the real memory write without changing the UI flow).
 */

import { useCallback, useEffect, useState } from 'react';
import { configService } from '@/common/config/configService';
import {
  isClientSeedSatisfied,
  shouldForceDayZeroOnboarding,
  type ClientSeedInput,
} from '@/common/config/creditsCore';

export interface DayZeroOnboardingState {
  /** Whether the force-onboarding prompt should be shown right now. */
  shouldForce: boolean;
  /** Record a real client seed: flips the persisted flag and forwards the seed. */
  recordSeed: (seed: ClientSeedInput) => Promise<void>;
  /** Dismiss without seeding (the gate re-fires next launch). */
  dismiss: () => void;
}

export interface UseDayZeroOnboardingArgs {
  /**
   * Only force onboarding once the user is past the entitlement gate (entitled).
   * The caller passes `gateEntitled` so the prompt never races the gate.
   */
  enabled: boolean;
  /**
   * Sink for the seed — the place that actually writes it into the Company-Brain
   * (Hermes/backend, OUT OF SCOPE here). Defaults to a no-op so the local
   * switching-cost flag is still recorded even before the memory write is wired.
   */
  onSeedRecorded?: (seed: ClientSeedInput) => Promise<void> | void;
}

export function useDayZeroOnboarding(args: UseDayZeroOnboardingArgs): DayZeroOnboardingState {
  const [alreadySeeded, setAlreadySeeded] = useState<boolean>(() => Boolean(configService.get('commandEve.clientSeeded')));
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  // Keep the local flag in sync with config (config initializes async at boot).
  useEffect(() => {
    void configService.whenReady().then(() => {
      setAlreadySeeded(Boolean(configService.get('commandEve.clientSeeded')));
    });
  }, []);

  const shouldForce =
    args.enabled &&
    !dismissedThisSession &&
    // No prior seed object yet at decision time; the gate is purely flag-driven.
    shouldForceDayZeroOnboarding({ alreadySeeded, seed: null });

  const recordSeed = useCallback(
    async (seed: ClientSeedInput) => {
      if (!isClientSeedSatisfied(seed)) return;
      // Forward to the Company-Brain sink first (best-effort), then persist the
      // local switching-cost flag so the prompt never re-nags.
      try {
        await args.onSeedRecorded?.(seed);
      } catch (error) {
        console.error('Day-0 client seed sink failed:', error);
      }
      await configService.set('commandEve.clientSeeded', true);
      setAlreadySeeded(true);
    },
    [args]
  );

  const dismiss = useCallback(() => {
    setDismissedThisSession(true);
  }, []);

  return { shouldForce, recordSeed, dismiss };
}
