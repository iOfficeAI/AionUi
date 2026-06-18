/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live credit meter badge (Lane 3, spec §3) — sits in the titlebar toolbar.
 *
 * Shows "X of allowance used / cap" + remaining purchased credits, refreshing
 * from the credits-status bridge via `useCreditsStatus`. On the free tier it
 * shows "N / cap actions". Quiet (renders nothing) before the first read, in
 * non-desktop builds, or when the status read fails — never breaks the chrome.
 *
 * Clicking the badge opens the billing settings tab (spend cap + pricing).
 */

import React, { useMemo } from 'react';
import { Progress, Tooltip } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useCreditsStatus } from '@renderer/hooks/useCreditsStatus';
import { isNearAllowanceWall, type CreditMeterModel } from '@/common/config/creditsCore';
import './billing.css';

export interface CreditMeterBadgeProps {
  /** Open the billing settings tab (spend cap + pricing). */
  onOpenBilling?: () => void;
}

/** Human-readable label for the meter, derived from the pure meter model. */
function meterLabel(meter: CreditMeterModel, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (meter.isFree) {
    return t('credits.meter.freeActions', {
      defaultValue: '{{used}} / {{cap}} actions',
      used: meter.freeActionsUsed,
      cap: meter.freeCap,
    });
  }
  const usedPct = Math.round(meter.allowanceUsedFraction * 100);
  return t('credits.meter.allowanceUsed', {
    defaultValue: '{{pct}}% of allowance used',
    pct: usedPct,
  });
}

const CreditMeterBadge: React.FC<CreditMeterBadgeProps> = ({ onOpenBilling }) => {
  const { t } = useTranslation();
  const { meter } = useCreditsStatus();

  const near = useMemo(() => (meter ? isNearAllowanceWall(meter) : false), [meter]);

  // Quiet by default: no status yet / non-desktop / read failed.
  if (!meter) return null;

  const percent = meter.isFree
    ? meter.freeCap > 0
      ? Math.round((meter.freeActionsUsed / meter.freeCap) * 100)
      : 0
    : Math.round(meter.allowanceUsedFraction * 100);

  const tooltipContent = (
    <div className='credit-meter-badge__tooltip'>
      <div>{meterLabel(meter, t)}</div>
      {!meter.isFree && (
        <>
          <div>
            {t('credits.meter.allowanceRemaining', {
              defaultValue: 'Allowance: {{n}} credits left',
              n: meter.allowanceRemaining,
            })}
          </div>
          <div>
            {t('credits.meter.purchasedRemaining', {
              defaultValue: 'Purchased: {{n}} credits left',
              n: meter.purchasedRemaining,
            })}
          </div>
        </>
      )}
      {meter.spendCapEurCents > 0 && (
        <div>
          {t('credits.meter.spendCap', {
            defaultValue: 'Spend cap: {{eur}}€',
            eur: (meter.spendCapEurCents / 100).toFixed(0),
          })}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent} position='bottom'>
      <button
        type='button'
        className='credit-meter-badge app-titlebar__button'
        onClick={onOpenBilling}
        aria-label={meterLabel(meter, t)}
        data-testid='credit-meter-badge'
        data-near-wall={near ? 'true' : 'false'}
      >
        <span className='credit-meter-badge__bar'>
          <Progress
            percent={percent}
            showText={false}
            size='small'
            status={near ? 'warning' : 'normal'}
            style={{ width: 56 }}
          />
        </span>
        <span className='credit-meter-badge__label'>{meterLabel(meter, t)}</span>
      </button>
    </Tooltip>
  );
};

export default CreditMeterBadge;
