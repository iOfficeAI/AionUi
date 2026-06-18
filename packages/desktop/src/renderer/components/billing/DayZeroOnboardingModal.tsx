/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Day-0 client-input onboarding hook (Lane 3, spec §3).
 *
 * At first run, force ONE real client input ("connect 1 client / paste 1 brief")
 * that seeds the Company-Brain (memory) — the early switching-cost. It fires once
 * (gated by `creditsCore.shouldForceDayZeroOnboarding` + the persisted
 * `commandEve.clientSeeded` flag) and never re-nags after a real seed.
 *
 * A blank/whitespace brief does NOT satisfy the requirement — the point is a real
 * seed. The actual deliverable generation is OUT OF SCOPE (Hermes does that);
 * this is only the nudge that records the seed + sets the flag.
 */

import React, { useState } from 'react';
import { Button, Input, Modal, Radio } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { isClientSeedSatisfied, type ClientSeedInput, type ClientSeedKind } from '@/common/config/creditsCore';
import './billing.css';

export interface DayZeroOnboardingModalProps {
  /** Whether to show the modal (caller computes via shouldForceDayZeroOnboarding). */
  open: boolean;
  /** Persist the seed + flip the seeded flag. Returns once persisted. */
  onSeed: (seed: ClientSeedInput) => Promise<void> | void;
  /** Allow skipping (records nothing; the gate re-fires next launch). */
  onSkip?: () => void;
}

const DayZeroOnboardingModal: React.FC<DayZeroOnboardingModalProps> = ({ open, onSeed, onSkip }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ClientSeedKind>('paste_brief');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const seed: ClientSeedInput = { kind, value };
  const canSubmit = isClientSeedSatisfied(seed);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSeed(seed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={open}
      title={null}
      footer={null}
      onCancel={onSkip}
      maskClosable={false}
      escToExit={false}
      className='day-zero-onboarding'
    >
      <div className='day-zero-onboarding__body' data-testid='day-zero-onboarding'>
        <h2 className='day-zero-onboarding__title'>
          {t('credits.onboarding.title', { defaultValue: 'Seed your Company Brain' })}
        </h2>
        <p className='day-zero-onboarding__lede'>
          {t('credits.onboarding.lede', {
            defaultValue: 'Give EVE one real client to learn from — a brief or a connection. Everything you build stays yours.',
          })}
        </p>

        <Radio.Group
          type='button'
          value={kind}
          onChange={(v) => setKind(v as ClientSeedKind)}
          className='day-zero-onboarding__kind'
        >
          <Radio value='paste_brief' data-testid='day-zero-kind-brief'>
            {t('credits.onboarding.pasteBrief', { defaultValue: 'Paste a brief' })}
          </Radio>
          <Radio value='connect_client' data-testid='day-zero-kind-connect'>
            {t('credits.onboarding.connectClient', { defaultValue: 'Connect a client' })}
          </Radio>
        </Radio.Group>

        {kind === 'paste_brief' ? (
          <Input.TextArea
            value={value}
            onChange={setValue}
            placeholder={t('credits.onboarding.briefPlaceholder', {
              defaultValue: 'Paste one real client brief here…',
            })}
            autoSize={{ minRows: 4, maxRows: 8 }}
            data-testid='day-zero-brief'
            disabled={submitting}
          />
        ) : (
          <Input
            value={value}
            onChange={setValue}
            placeholder={t('credits.onboarding.connectPlaceholder', {
              defaultValue: 'Client name or workspace to connect…',
            })}
            data-testid='day-zero-connect'
            disabled={submitting}
          />
        )}

        <div className='day-zero-onboarding__actions'>
          <Button
            type='primary'
            long
            shape='round'
            disabled={!canSubmit}
            loading={submitting}
            onClick={handleSubmit}
            data-testid='day-zero-submit'
          >
            {t('credits.onboarding.submit', { defaultValue: 'Seed & start' })}
          </Button>
          {onSkip && (
            <button
              type='button'
              className='day-zero-onboarding__skip'
              onClick={onSkip}
              disabled={submitting}
              data-testid='day-zero-skip'
            >
              {t('credits.onboarding.skip', { defaultValue: 'Later' })}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DayZeroOnboardingModal;
