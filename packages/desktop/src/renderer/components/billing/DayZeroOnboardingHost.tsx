/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Day-0 onboarding host (Lane 3). Renders the one-client-input modal once the
 * user is entitled and has not yet seeded the Company-Brain. Mounted by
 * ProtectedLayout AFTER the entitlement gate passes, so it never races the gate.
 */

import React from 'react';
import DayZeroOnboardingModal from './DayZeroOnboardingModal';
import { useDayZeroOnboarding } from '@renderer/hooks/useDayZeroOnboarding';

export interface DayZeroOnboardingHostProps {
  /** True iff the entitlement gate has passed (entitled). */
  entitled: boolean;
}

const DayZeroOnboardingHost: React.FC<DayZeroOnboardingHostProps> = ({ entitled }) => {
  const { shouldForce, recordSeed, dismiss } = useDayZeroOnboarding({ enabled: entitled });

  if (!shouldForce) return null;

  return <DayZeroOnboardingModal open onSeed={recordSeed} onSkip={dismiss} />;
};

export default DayZeroOnboardingHost;
