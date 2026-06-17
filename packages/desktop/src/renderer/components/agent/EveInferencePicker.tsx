/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EVE Inference picker — the ONLY model picker a Command EVE trial user sees.
 *
 * Founder mandate: "nothing confusing". So this renders EXACTLY TWO groups and
 * nothing else — no raw CLI/agent picker, no raw provider/model list:
 *
 *   - Privat (lokal):   Standard (Gemma 4 E4B) · High (Gemma 4 12B)
 *   - EVE Inference:    Standard · High · Max
 *
 * When the entitlement is trialing/free (entitlementCore CEVE.v2
 * `trial_ends_at` present), EVE High + EVE Max are GREYED OUT (disabled) with a
 * subtle "im Paid-Tarif" hint. Only EVE Standard + the two local tiers stay
 * selectable. The picker model + gating come from the pure `eveInferenceCore`.
 *
 * The selection is persisted to `commandEve.inferenceSelection`; the send path
 * resolves it (and injects the CEVE bearer for an EVE tier) via the main-process
 * `command-eve.resolve-inference-provider` bridge — this component never holds
 * the raw license wire.
 */

import { isEveInferenceSelection, type EvePickerItem } from '@/common/config/eveInferenceCore';
import { useEveInferenceSelection } from '@renderer/hooks/agent/useEveInferenceSelection';
import { iconColors } from '@renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain } from '@icon-park/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const PAID_HINT_DE = 'im Paid-Tarif';

const EveInferencePicker: React.FC<{
  /** Called with the new selection value when the user picks an item. */
  onChange?: (selection: string) => void;
  /** Disable the whole control (e.g. while sending). */
  disabled?: boolean;
}> = ({ onChange, disabled }) => {
  const { t } = useTranslation();
  // All state/persistence/gating lives in the shared hook so the GuidPage
  // picker, the in-session header and the mobile sheets never drift apart.
  const { selection, groups, selectedItem, commit } = useEveInferenceSelection(onChange);

  const handleSelect = useCallback(
    (item: EvePickerItem) => {
      if (item.disabled) return;
      commit(item.value);
    },
    [commit]
  );

  const displayLabel = useMemo(() => {
    if (selectedItem) {
      const groupTitle = selectedItem.group === 'eve' ? 'EVE' : t('common.localModel', 'Lokal');
      return `${groupTitle} · ${selectedItem.label}`;
    }
    return t('conversation.eveInference.pick', 'Modell wählen');
  }, [selectedItem, t]);

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

  const droplist = (
    <Menu className='eve-inference-picker-menu' style={{ maxWidth: 280 }}>
      {groups.map((group) => (
        <Menu.ItemGroup key={group.kind} title={group.title}>
          {group.items.map((item) => {
            const row = (
              <Menu.Item
                key={item.value}
                disabled={item.disabled}
                className={item.value === selection && !item.disabled ? 'bg-2!' : ''}
                onClick={() => handleSelect(item)}
              >
                <div className='flex items-center justify-between gap-8px w-full'>
                  <span className='flex items-center gap-6px min-w-0'>
                    <span className={item.disabled ? 'opacity-50' : ''}>{item.label}</span>
                    {item.sublabel ? (
                      <span className='text-12px opacity-50'>({item.sublabel})</span>
                    ) : null}
                  </span>
                  {item.disabled && item.disabledReasonCode === 'PAID_TIER_REQUIRED' ? (
                    <span className='text-11px opacity-50 shrink-0'>{PAID_HINT_DE}</span>
                  ) : null}
                </div>
              </Menu.Item>
            );
            // A disabled paid row gets a tooltip explaining why it is greyed.
            return item.disabled ? (
              <Tooltip
                key={item.value}
                position='left'
                content={t('conversation.eveInference.paidOnly', 'Nur im Paid-Tarif verfügbar')}
              >
                {row}
              </Tooltip>
            ) : (
              row
            );
          })}
        </Menu.ItemGroup>
      ))}
    </Menu>
  );

  return (
    <Dropdown trigger='click' droplist={droplist} disabled={disabled} position='bl'>
      <Button
        className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
        shape='round'
        size='small'
        disabled={disabled}
      >
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          {renderLogo()}
          <span className='truncate'>{displayLabel}</span>
        </span>
      </Button>
    </Dropdown>
  );
};

export default EveInferencePicker;

// Re-export so callers can detect whether the active selection is the cloud
// lane (e.g. to show an egress notice) without re-importing the core.
export { isEveInferenceSelection };
