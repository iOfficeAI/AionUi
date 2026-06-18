/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * €-value receipt (Lane 3, spec §3) — the value framing that fires the
 * take-the-max trigger. After EVE completes a deliverable, shows
 * "EVE shipped {artifact} ≈ ~{hours}h / ~{eur}€ of your work".
 *
 * The hours→€ monetization lives in the PURE `creditsCore.buildValueReceiptModel`
 * (unit-tested). This component reads the user's blended hourly rate from config
 * (founder-overridable) and renders the headline.
 */

import React, { useMemo } from 'react';
import { Card } from '@arco-design/web-react';
import { configService } from '@/common/config/configService';
import {
  buildValueReceiptModel,
  DEFAULT_VALUE_RECEIPT_HOURLY_EUR,
} from '@/common/config/creditsCore';
import './billing.css';

export interface ValueReceiptProps {
  /** What EVE shipped, in the persona's own verb (e.g. "32 ad variants"). */
  artifact: string;
  /** Estimated hours of the user's own work this deliverable replaced. */
  estimatedHours: number;
  /** Override the hourly rate (tests inject this; defaults to config / DEFAULT). */
  hourlyRateEur?: number;
}

const ValueReceipt: React.FC<ValueReceiptProps> = ({ artifact, estimatedHours, hourlyRateEur }) => {
  const rate = useMemo(() => {
    if (typeof hourlyRateEur === 'number' && hourlyRateEur > 0) return hourlyRateEur;
    const configured = configService.get('commandEve.valueReceiptHourlyEur');
    return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_VALUE_RECEIPT_HOURLY_EUR;
  }, [hourlyRateEur]);

  const model = useMemo(
    () => buildValueReceiptModel({ artifact, estimatedHours, hourlyRateEur: rate }),
    [artifact, estimatedHours, rate]
  );

  return (
    <Card className='value-receipt' bordered data-testid='value-receipt'>
      <div className='value-receipt__icon' aria-hidden='true'>
        ⌘
      </div>
      <div className='value-receipt__headline' data-testid='value-receipt-headline'>
        {model.headline}
      </div>
      <div className='value-receipt__detail'>
        <span data-testid='value-receipt-hours'>~{model.hours}h</span>
        <span aria-hidden='true'> · </span>
        <span data-testid='value-receipt-eur'>~{model.eurValue}€</span>
      </div>
    </Card>
  );
};

export default ValueReceipt;
