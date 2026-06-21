/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads the Command EVE onboarding-status from the main process (the S0
 * `command-eve.onboarding-status` read-only aggregator) and derives the S2
 * one-time readiness-greeting view-model via the pure `onboardingGreetingCore`.
 *
 * Mirrors `useCreditsStatus`/`useEntitlementGate`: the main process is the only
 * source of truth — this hook never re-decides any gate, it reads the model and
 * maps it. In non-desktop (WebUI) builds there is no bridge, so the hook reports
 * nothing and the greeting renders nothing (the chat just stays empty).
 *
 * It reads ONCE on mount (the greeting is a one-shot, not a live meter). A
 * `refresh` is exposed for callers that want to re-read after activation.
 */

import { useCallback, useEffect, useState } from 'react';
import { commandEve, type ICommandEveOnboardingStatusModel } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@renderer/utils/platform';
import {
  buildOnboardingGreeting,
  type CommandEveGreetingModel,
} from '@/common/config/onboardingGreetingCore';

export interface OnboardingStatusState {
  /** True until the first status read resolves. */
  loading: boolean;
  /** The raw setup-completeness model, or null before first read / non-desktop / on error. */
  model: ICommandEveOnboardingStatusModel | null;
  /** The derived one-time greeting view-model (null until a model is read). */
  greeting: CommandEveGreetingModel | null;
  /** Re-read the onboarding status now (e.g. after activation completes). */
  refresh: () => Promise<void>;
}

export function useOnboardingStatus(): OnboardingStatusState {
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<ICommandEveOnboardingStatusModel | null>(null);
  const [greeting, setGreeting] = useState<CommandEveGreetingModel | null>(null);

  const refresh = useCallback(async () => {
    if (!isElectronDesktop()) {
      setModel(null);
      setGreeting(null);
      setLoading(false);
      return;
    }
    try {
      const response = await commandEve.onboardingStatus.invoke();
      const data = response.data ?? null;
      const nextModel = data && data.ok && data.model ? data.model : null;
      setModel(nextModel);
      setGreeting(nextModel ? buildOnboardingGreeting(nextModel) : null);
    } catch (error) {
      // A read failure must NEVER crash the chat or block the operator — the
      // greeting simply stays quiet (null) and the empty chat renders as before.
      console.error('Onboarding status bridge call failed:', error);
      setModel(null);
      setGreeting(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, model, greeting, refresh };
}
