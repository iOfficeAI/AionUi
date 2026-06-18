/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The 402 quota_exhausted WALL renderer (Lane 3, spec §3) — the conversion core.
 *
 * Renders ONLY when a job is in-flight (idle-suppression via
 * `shouldSurfaceQuotaWall`): an idle wall = no urgency + scares skeptics.
 *
 * Framing is "finish THIS job", never "buy a plan":
 *   - transparent credit math: "this job ≈ N credits; the 100-pack ≈ M more jobs like this"
 *   - default-selects the 100€ (else 250€) pack — justified in DELIVERABLES, not euros
 *   - one-click buy (opens the Lane-2 checkout) + an auto-reload toggle
 *
 * The math + default-pack selection live in the PURE `creditsCore` (unit-tested);
 * this component is the presentation + the buy wiring.
 */

import React, { useMemo, useState } from 'react';
import { Button, Modal, Radio, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { openExternalUrl } from '@renderer/utils/platform';
import {
  buildWallModel,
  shouldSurfaceQuotaWall,
  type QuotaExhaustedBody,
  type WallPack,
} from '@/common/config/creditsCore';
import './billing.css';

/**
 * The Lane-2 checkout destination for a credit-pack buy. The desktop never holds
 * a card; it opens the web checkout pre-scoped to the chosen pack.
 */
export const CREDIT_PACK_CHECKOUT_URL = 'https://command-eve.com/account/credits';

export interface QuotaExhaustedWallProps {
  /** The parsed 402 quota_exhausted body, or null when there is no quota signal. */
  body: QuotaExhaustedBody | null;
  /** True iff a conversation turn / deliverable is currently running. */
  jobInFlight: boolean;
  /** Optional raw €/credit to margin-guard the server packs (default-select skips a bad pack). */
  rawEurPerCredit?: number;
  /** Dismiss the wall (user chose to stop here). */
  onClose: () => void;
  /** Auto-reload toggle initial state (persisted by the caller). */
  autoReloadDefault?: boolean;
  /** Called when the user changes the auto-reload toggle. */
  onAutoReloadChange?: (enabled: boolean) => void;
  /** Override the checkout open (tests inject this; defaults to openExternalUrl). */
  openCheckout?: (url: string) => Promise<void> | void;
}

/** Build the deep-link to the Lane-2 checkout for a specific pack. */
function checkoutUrlForPack(pack: WallPack): string {
  const params = new URLSearchParams({ pack_eur: String(pack.eur) });
  return `${CREDIT_PACK_CHECKOUT_URL}?${params.toString()}`;
}

const QuotaExhaustedWall: React.FC<QuotaExhaustedWallProps> = ({
  body,
  jobInFlight,
  rawEurPerCredit,
  onClose,
  autoReloadDefault = false,
  onAutoReloadChange,
  openCheckout,
}) => {
  const { t } = useTranslation();

  // Idle-suppression: the single gate the whole wall pipeline depends on.
  const surface = shouldSurfaceQuotaWall({ jobInFlight, hasQuotaSignal: body !== null });

  const wall = useMemo(() => (body ? buildWallModel(body, rawEurPerCredit) : null), [body, rawEurPerCredit]);

  // Default-selected pack drives the radio's initial value.
  const [selectedEur, setSelectedEur] = useState<number | null>(null);
  const effectiveSelectedEur = useMemo(() => {
    if (selectedEur !== null) return selectedEur;
    if (wall && wall.defaultPackIndex >= 0) return wall.packs[wall.defaultPackIndex].eur;
    return null;
  }, [selectedEur, wall]);

  const [autoReload, setAutoReload] = useState(autoReloadDefault);

  if (!surface || !wall) return null;

  const selectedPack = wall.packs.find((p) => p.eur === effectiveSelectedEur) ?? wall.packs[0];

  const handleBuy = async () => {
    if (!selectedPack) return;
    const url = checkoutUrlForPack(selectedPack);
    try {
      await (openCheckout ? openCheckout(url) : openExternalUrl(url));
    } catch (error) {
      console.error('Failed to open credit-pack checkout:', error);
    }
  };

  return (
    <Modal
      visible
      title={null}
      footer={null}
      onCancel={onClose}
      maskClosable
      className='quota-exhausted-wall'
      escToExit
    >
      <div className='quota-exhausted-wall__body' data-testid='quota-exhausted-wall'>
        {/* "finish THIS job" framing — never "buy a plan". */}
        <h2 className='quota-exhausted-wall__title' data-testid='quota-wall-title'>
          {t('credits.wall.title', { defaultValue: 'Keep this job going' })}
        </h2>

        {/* Transparent credit math. */}
        <p className='quota-exhausted-wall__math' data-testid='quota-wall-math'>
          {t('credits.wall.jobCost', {
            defaultValue: 'This job needs ≈ {{n}} more credits to finish.',
            n: wall.creditsNeeded,
          })}
        </p>

        <Radio.Group
          value={effectiveSelectedEur ?? undefined}
          onChange={(value) => setSelectedEur(typeof value === 'number' ? value : null)}
          direction='vertical'
          className='quota-exhausted-wall__packs'
        >
          {wall.packs.map((pack) => (
            <Radio key={pack.eur} value={pack.eur} data-testid={`quota-wall-pack-${pack.eur}`}>
              <span className='quota-exhausted-wall__pack-row'>
                <span className='quota-exhausted-wall__pack-price'>
                  {pack.eur}€
                  {pack.bonus > 0 && (
                    <span className='quota-exhausted-wall__pack-bonus'>
                      {t('credits.wall.bonus', { defaultValue: '+{{n}} bonus', n: pack.bonus })}
                    </span>
                  )}
                  {pack.isDefaultSelected && (
                    <span className='quota-exhausted-wall__pack-default' data-testid={`quota-wall-default-${pack.eur}`}>
                      {t('credits.wall.recommended', { defaultValue: 'recommended' })}
                    </span>
                  )}
                </span>
                {/* Justified in DELIVERABLES, not euros. */}
                <span className='quota-exhausted-wall__pack-jobs'>
                  {t('credits.wall.moreJobs', {
                    defaultValue: '≈ {{n}} more jobs like this',
                    n: pack.jobsLikeThis,
                  })}
                </span>
              </span>
            </Radio>
          ))}
        </Radio.Group>

        <label className='quota-exhausted-wall__autoreload'>
          <Switch
            size='small'
            checked={autoReload}
            onChange={(checked) => {
              setAutoReload(checked);
              onAutoReloadChange?.(checked);
            }}
            data-testid='quota-wall-autoreload'
          />
          <span>{t('credits.wall.autoReload', { defaultValue: 'Auto-reload when credits run low' })}</span>
        </label>

        <div className='quota-exhausted-wall__actions'>
          <Button
            type='primary'
            long
            shape='round'
            onClick={handleBuy}
            data-testid='quota-wall-buy'
            disabled={!selectedPack}
          >
            {t('credits.wall.buy', {
              defaultValue: 'Continue — add {{eur}}€ credits',
              eur: selectedPack?.eur ?? '',
            })}
          </Button>
          <button type='button' className='quota-exhausted-wall__later' onClick={onClose} data-testid='quota-wall-later'>
            {t('credits.wall.later', { defaultValue: 'Not now' })}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default QuotaExhaustedWall;
