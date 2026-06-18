/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EVE Inference picker — the ONLY model picker a Command EVE user sees. The user
 * picks a STUFE (level), never a raw model id.
 *
 * Founder mandate: "nothing confusing". So this renders EXACTLY TWO groups and
 * nothing else — no raw CLI/agent picker, no raw provider/model list:
 *
 *   - Privat (lokal):   Standard (Gemma 4 E4B) · Hoch (Gemma 4 12B)
 *   - EVE Inference:    Standard · Hoch · Max · Maximum
 *
 * EVE LEVELS (Stufen):
 *   - Standard / Hoch — FREE (Standard is the default).
 *   - Max — PAID (DeepSeek V4 Pro). Marked "verbraucht Credits".
 *   - Maximum / "härteste Aufgabe" — PAID + GATED (GLM 5.2). Carries a VISIBLE
 *     higher-cost badge ("~5× Kosten") so the rate is obvious before picking.
 *
 * When the entitlement is trialing/free (entitlementCore CEVE.v2
 * `trial_ends_at` present), EVE Max + EVE Maximum are GREYED OUT (disabled) with
 * a subtle "im Paid-Tarif" hint. Only EVE Standard + EVE Hoch + the two local
 * tiers stay selectable. The picker model + gating come from the pure
 * `eveInferenceCore`.
 *
 * The selection is persisted to `commandEve.inferenceSelection`; the send path
 * resolves it (and injects the CEVE bearer for an EVE level) via the main-process
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
      // Honest cloud labeling: the EVE lane is external cloud, so the chip reads
      // "EVE Cloud · <tier>" — never just "EVE" (which could read as private).
      const groupTitle = selectedItem.group === 'eve' ? 'EVE Cloud' : t('common.localModel', 'Lokal');
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
                  <span className='flex items-center gap-6px shrink-0'>
                    {/* Cost badge: the GATED (Maximum) level gets a loud, high-cost
                        badge so the ~5× rate is unmistakable; the credit-consuming
                        Max level gets a softer credit marker. Always shown,
                        whether or not the row is greyed while trialing. */}
                    {item.costBadge ? (
                      <span
                        className={
                          item.gated
                            ? 'text-11px font-600 px-6px py-1px rounded-full text-warning bg-warning-light-1 shrink-0'
                            : 'text-11px px-6px py-1px rounded-full opacity-70 bg-2 shrink-0'
                        }
                        title={
                          item.gated
                            ? t('conversation.eveInference.highestCost', 'Höchste Kosten — nur für die härteste Aufgabe')
                            : t('conversation.eveInference.consumesCredits', 'Verbraucht Credits')
                        }
                      >
                        {item.costBadge}
                      </span>
                    ) : null}
                    {item.disabled && item.disabledReasonCode === 'PAID_TIER_REQUIRED' ? (
                      <span className='text-11px opacity-50 shrink-0'>{PAID_HINT_DE}</span>
                    ) : null}
                  </span>
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
