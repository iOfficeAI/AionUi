/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE guided onboarding (SLICE S2) — the one-time readiness greeting.
 *
 * Rendered into the chat `emptySlot` seam, which the MessageList shows ONLY when
 * a conversation has zero messages. So this greeting is inherently one-shot and
 * non-persistent: the moment the operator sends a first message it disappears,
 * and it never writes a message or any state. No new message type, no storage.
 *
 * It reads the S0 onboarding-status model via `useOnboardingStatus`, derives the
 * German checklist via the pure `onboardingGreetingCore`, and:
 *   - ready  → renders the warm "du bist startklar" state.
 *   - !ready → renders ONLY the real remaining gaps, each with a "klick hier"
 *     link to the existing in-app page that closes it.
 *
 * Safety: if the bridge is unavailable, the read fails, or the model is missing,
 * it renders NOTHING (returns null) — the empty chat looks exactly as before.
 * HONESTY: no secret/API-key prompt, no learned-from-seed or connector claim.
 */

import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStatus } from '@renderer/hooks/useOnboardingStatus';
import type {
  CommandEveGreetingGap,
  CommandEveGreetingLinkTarget,
} from '@/common/config/onboardingGreetingCore';

/** Map a pure-core link target onto an existing app hash-route. */
function targetToRoute(target: CommandEveGreetingLinkTarget): string | null {
  switch (target) {
    case 'registration':
      // License / cloud-bearer re-activation lives at the billing settings
      // surface. (A truly UNregistered user never reaches the chat — the
      // registration gate is structural and replaces the layout — so this link
      // serves the licensed-but-no-bearer re-activation case.)
      return '/settings/billing';
    case 'runtime':
      // The read-only local-runtime page (S4 RemediationCard renders here).
      return '/runtime';
    case 'none':
    default:
      return null;
  }
}

const GapRow: React.FC<{ gap: CommandEveGreetingGap; onNavigate: (route: string) => void }> = ({
  gap,
  onNavigate,
}) => {
  const route = targetToRoute(gap.link_target);
  return (
    <div
      data-testid={`eve-onboarding-greeting-gap-${gap.id}`}
      className='flex items-start gap-10px px-14px py-10px rd-10px bg-fill-2 text-left'
    >
      <span className='text-15px leading-22px shrink-0' aria-hidden>
        •
      </span>
      <span className='text-13px text-t-secondary leading-20px'>
        {gap.text}
        {route && gap.link_label ? (
          <>
            {' '}
            <a
              data-testid={`eve-onboarding-greeting-link-${gap.id}`}
              className='text-primary hover:underline cursor-pointer'
              onClick={() => onNavigate(route)}
            >
              {gap.link_label}
            </a>
          </>
        ) : null}
      </span>
    </div>
  );
};

const OnboardingReadinessGreeting: React.FC = () => {
  const navigate = useNavigate();
  const { loading, greeting } = useOnboardingStatus();

  const onNavigate = useCallback(
    (route: string) => {
      void Promise.resolve(navigate(route)).catch((error) => {
        console.error('Onboarding greeting navigation failed:', error);
      });
    },
    [navigate]
  );

  // Quiet while loading, on non-desktop, or on any read failure — the empty
  // chat then renders exactly as before (no flicker, no broken card).
  if (loading || !greeting) return null;

  return (
    <div
      data-testid='eve-onboarding-greeting'
      data-ready={greeting.ready ? 'true' : 'false'}
      className='flex flex-col items-center gap-16px px-24px text-center max-w-420px'
    >
      <div className='flex flex-col gap-6px'>
        <span className='text-18px font-semibold text-t-primary'>{greeting.headline}</span>
        <span className='text-13px text-t-secondary'>{greeting.subline}</span>
      </div>
      {!greeting.ready && greeting.gaps.length > 0 && (
        <div className='flex flex-col gap-8px w-full'>
          {greeting.gaps.map((gap) => (
            <GapRow key={gap.id} gap={gap} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
};

export default OnboardingReadinessGreeting;
