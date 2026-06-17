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

import { configService } from '@/common/config/configService';
import {
  buildEvePickerGroups,
  EVE_DEFAULT_INFERENCE_SELECTION,
  EVE_INFERENCE_DEFAULT_TIER_ID,
  eveTierValue,
  isEveInferenceSelection,
  type EvePickerItem,
} from '@/common/config/eveInferenceCore';
import { useEntitlementGate } from '@renderer/hooks/useEntitlementGate';
import { iconColors } from '@renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PAID_HINT_DE = 'im Paid-Tarif';

const EveInferencePicker: React.FC<{
  /** Called with the new selection value when the user picks an item. */
  onChange?: (selection: string) => void;
  /** Disable the whole control (e.g. while sending). */
  disabled?: boolean;
}> = ({ onChange, disabled }) => {
  const { t } = useTranslation();
  const { status } = useEntitlementGate();

  const [selection, setSelection] = useState<string>(() => {
    // Default to EVE Standard (cloud) for a fresh user; local Gemma is opt-in.
    return configService.get('commandEve.inferenceSelection') || EVE_DEFAULT_INFERENCE_SELECTION;
  });

  // Keep local state in sync with config changes from elsewhere.
  useEffect(() => {
    const unsubscribe = configService.subscribe('commandEve.inferenceSelection', (value) => {
      if (typeof value === 'string' && value.length > 0) setSelection(value);
    });
    return unsubscribe;
  }, []);

  // Two-group model, gated by the current entitlement.
  const groups = useMemo(() => buildEvePickerGroups(status), [status]);

  // Flatten for label lookup. If the persisted selection is now disabled
  // (e.g. trial picked EVE High in a prior paid session), fall back to EVE
  // Standard so the displayed selection is always a selectable one.
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selectedItem = useMemo(() => allItems.find((i) => i.value === selection), [allItems, selection]);
  const effectiveSelectedItem = selectedItem && !selectedItem.disabled ? selectedItem : undefined;

  const commit = useCallback(
    (value: string) => {
      setSelection(value);
      configService.set('commandEve.inferenceSelection', value);
      // Mirror the EVE-vs-local choice into the existing tier key so the rest
      // of the runtime (warmup, status) keeps working for the local lanes.
      onChange?.(value);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (item: EvePickerItem) => {
      if (item.disabled) return;
      commit(item.value);
    },
    [commit]
  );

  // If trialing flips a previously-selected paid EVE tier to disabled, reset to
  // the safe default (EVE Standard) once, so the picker never shows a disabled
  // value as "active".
  useEffect(() => {
    if (selectedItem && selectedItem.disabled) {
      commit(eveTierValue(EVE_INFERENCE_DEFAULT_TIER_ID));
    }
  }, [selectedItem, commit]);

  const displayLabel = useMemo(() => {
    if (effectiveSelectedItem) {
      const groupTitle = effectiveSelectedItem.group === 'eve' ? 'EVE' : t('common.localModel', 'Lokal');
      return `${groupTitle} · ${effectiveSelectedItem.label}`;
    }
    return t('conversation.eveInference.pick', 'Modell wählen');
  }, [effectiveSelectedItem, t]);

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
