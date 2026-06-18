/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Billing settings tab (Lane 3, spec §3 + §6).
 *
 * - Live credit meter (full readout).
 * - User SPEND-CAP setting (writes spend_cap_eur_cents via the bridge).
 * - Pricing UI: 79€ Starter + the credit packs; no-card trial entry. The hidden
 *   Solo-49 row surfaces ONLY on a churn signal (config `commandEve.churnSignal`),
 *   never in the default list (a visible cheaper tier anchors converters DOWN).
 *
 * The euro/credit MATH + the visible-plan decision live in the PURE `creditsCore`
 * (unit-tested); this component is the settings presentation + the bridge wiring.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, InputNumber, Message, Progress, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { openExternalUrl } from '@renderer/utils/platform';
import { configService } from '@/common/config/configService';
import { useCreditsStatus } from '@renderer/hooks/useCreditsStatus';
import {
  buildPricingPlans,
  DEFAULT_CREDIT_PACKS,
  STARTER_PLAN_EUR,
  validateSpendCapEur,
} from '@/common/config/creditsCore';

/** The Lane-2 no-card trial entry + checkout destinations (desktop holds no card). */
const TRIAL_ENTRY_URL = 'https://command-eve.com/account';
const PACK_CHECKOUT_URL = 'https://command-eve.com/account/credits';

const BillingModalContent: React.FC = () => {
  const { t } = useTranslation();
  const { meter, status, setSpendCap } = useCreditsStatus();

  // Churn signal gates the hidden Solo-49 plan into the pricing list (spec §6).
  const churnSignal = configService.get('commandEve.churnSignal') ?? false;
  const plans = useMemo(() => buildPricingPlans({ churnSignal }), [churnSignal]);

  // Spend-cap form state (euros). Seeded from the current status.
  const [capEur, setCapEur] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (status && status.ok) {
      setCapEur(status.spend_cap_eur_cents > 0 ? Math.round(status.spend_cap_eur_cents / 100) : undefined);
    }
  }, [status]);

  const handleSaveCap = async () => {
    const validation = validateSpendCapEur(capEur ?? 0);
    if (!validation.ok) {
      Message.error(
        t('credits.settings.capInvalid', { defaultValue: 'Enter a valid spend cap (0 = uncapped).' })
      );
      return;
    }
    setSaving(true);
    try {
      const ok = await setSpendCap(capEur ?? 0);
      if (ok) {
        Message.success(t('credits.settings.capSaved', { defaultValue: 'Spend cap saved.' }));
      } else {
        Message.error(t('credits.settings.capFailed', { defaultValue: 'Could not save the spend cap.' }));
      }
    } finally {
      setSaving(false);
    }
  };

  const openTrial = () => {
    void openExternalUrl(TRIAL_ENTRY_URL).catch((): undefined => undefined);
  };
  const openPackCheckout = (eur: number) => {
    void openExternalUrl(`${PACK_CHECKOUT_URL}?pack_eur=${eur}`).catch((): undefined => undefined);
  };

  return (
    <div className='billing-settings' data-testid='billing-settings'>
      {/* Live meter readout */}
      {meter ? (
        <Card className='billing-settings__meter' data-testid='billing-settings-meter'>
          {meter.isFree ? (
            <>
              <div className='billing-settings__meter-label'>
                {t('credits.settings.freeActions', {
                  defaultValue: '{{used}} / {{cap}} free actions used',
                  used: meter.freeActionsUsed,
                  cap: meter.freeCap,
                })}
              </div>
              <Progress
                percent={meter.freeCap > 0 ? Math.round((meter.freeActionsUsed / meter.freeCap) * 100) : 0}
                showText={false}
              />
            </>
          ) : (
            <>
              <div className='billing-settings__meter-label'>
                {t('credits.settings.allowanceUsed', {
                  defaultValue: '{{pct}}% of allowance used · {{rem}} credits left',
                  pct: Math.round(meter.allowanceUsedFraction * 100),
                  rem: meter.totalRemaining,
                })}
              </div>
              <Progress percent={Math.round(meter.allowanceUsedFraction * 100)} showText={false} />
              <div className='billing-settings__meter-detail'>
                {t('credits.settings.purchasedRemaining', {
                  defaultValue: '{{n}} purchased credits',
                  n: meter.purchasedRemaining,
                })}
              </div>
            </>
          )}
        </Card>
      ) : (
        <Alert
          type='info'
          content={t('credits.settings.noStatus', { defaultValue: 'Credit status will appear once you are signed in.' })}
        />
      )}

      {/* Spend-cap setting */}
      <Card className='billing-settings__cap' title={t('credits.settings.spendCapTitle', { defaultValue: 'Spend cap' })}>
        <p className='billing-settings__hint'>
          {t('credits.settings.spendCapHint', {
            defaultValue: 'Cap how much EVE may spend on credits per period. 0 = uncapped.',
          })}
        </p>
        <div className='billing-settings__cap-row'>
          <InputNumber
            min={0}
            value={capEur}
            onChange={(v) => setCapEur(typeof v === 'number' ? v : undefined)}
            suffix='€'
            placeholder='0'
            style={{ width: 160 }}
            data-testid='billing-spend-cap-input'
          />
          <Button type='primary' loading={saving} onClick={handleSaveCap} data-testid='billing-spend-cap-save'>
            {t('credits.settings.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      </Card>

      {/* Pricing UI: Starter (+ hidden Solo on churn signal) */}
      <Card className='billing-settings__plans' title={t('credits.settings.plansTitle', { defaultValue: 'Plans' })}>
        {plans.map((plan) => (
          <div key={plan.id} className='billing-settings__plan-row' data-testid={`billing-plan-${plan.id}`}>
            <span className='billing-settings__plan-name'>
              {plan.id === 'starter'
                ? t('credits.settings.starter', { defaultValue: 'Starter' })
                : t('credits.settings.solo', { defaultValue: 'Solo' })}
            </span>
            <span className='billing-settings__plan-price'>{plan.priceEur}€/mo</span>
            {plan.id === 'solo' && (
              <Tag color='gray'>{t('credits.settings.churnOnly', { defaultValue: 'save offer' })}</Tag>
            )}
          </div>
        ))}
        <p className='billing-settings__hint'>
          {t('credits.settings.starterIncludes', {
            defaultValue: 'Starter ({{eur}}€) includes a monthly Action-Credit allowance + your Company Brain.',
            eur: STARTER_PLAN_EUR,
          })}
        </p>
        <Button long shape='round' onClick={openTrial} data-testid='billing-trial-entry'>
          {t('credits.settings.startTrial', { defaultValue: 'Start free — no card' })}
        </Button>
      </Card>

      {/* Credit packs */}
      <Card className='billing-settings__packs' title={t('credits.settings.packsTitle', { defaultValue: 'Credit packs' })}>
        <p className='billing-settings__hint'>
          {t('credits.settings.packsHint', {
            defaultValue: 'Out of allowance? Top up. Going big = a bigger pack, never a higher plan.',
          })}
        </p>
        <div className='billing-settings__pack-grid'>
          {DEFAULT_CREDIT_PACKS.map((pack) => (
            <Button
              key={pack.eur}
              className='billing-settings__pack'
              onClick={() => openPackCheckout(pack.eur)}
              data-testid={`billing-pack-${pack.eur}`}
            >
              <span className='billing-settings__pack-price'>{pack.eur}€</span>
              {pack.bonus > 0 && (
                <span className='billing-settings__pack-bonus'>
                  {t('credits.settings.packBonus', { defaultValue: '+{{n}} bonus', n: pack.bonus })}
                </span>
              )}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default BillingModalContent;
