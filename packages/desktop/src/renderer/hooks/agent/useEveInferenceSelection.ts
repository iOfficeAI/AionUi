/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useEveInferenceSelection — the single source of truth for the Command EVE
 * inference tier selection across every surface that lets the user pick it:
 *
 *   - Pre-chat:  GuidPage (via {@link EveInferencePicker}).
 *   - In-chat:   the conversation header (desktop) and the mobile action sheet.
 *
 * It owns exactly the behaviour the founder mandate requires and nothing else:
 *   - read/persist the choice from/to `commandEve.inferenceSelection`
 *     (configService) so a switch made anywhere takes effect on the next turn
 *     (the send-path shim re-reads the live selection per request);
 *   - build the two-group picker model gated by the live entitlement
 *     (EVE High/Max greyed while trialing) via the pure `eveInferenceCore`;
 *   - expose the current display label + a `commit` that resets a now-disabled
 *     paid tier back to EVE Standard.
 *
 * Keeping this in ONE hook means the desktop component, the header injection and
 * both mobile sheets cannot drift apart.
 */

import { configService } from '@/common/config/configService';
import {
  buildEvePickerGroups,
  EVE_DEFAULT_INFERENCE_SELECTION,
  EVE_INFERENCE_DEFAULT_TIER_ID,
  eveTierValue,
  type EvePickerGroup,
  type EvePickerItem,
} from '@/common/config/eveInferenceCore';
import { useEntitlementGate } from '@renderer/hooks/useEntitlementGate';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseEveInferenceSelectionResult {
  /** The persisted/active selection value (always a known picker value). */
  selection: string;
  /** Two-group picker model, gated by the current entitlement. */
  groups: EvePickerGroup[];
  /** Flattened items across both groups (label lookup / sheet rows). */
  items: EvePickerItem[];
  /** The currently-selected, still-selectable item (undefined if none). */
  selectedItem: EvePickerItem | undefined;
  /** Persist a new selection. No-op for an unknown/disabled value. */
  commit: (value: string) => void;
  /** True iff `value` is a known, selectable item. */
  isSelectable: (value: string) => boolean;
}

/**
 * @param onChange Optional callback fired after a successful commit (e.g. to
 *   surface an egress notice). The persistence to configService happens first.
 */
export function useEveInferenceSelection(onChange?: (selection: string) => void): UseEveInferenceSelectionResult {
  const { status } = useEntitlementGate();

  const [selection, setSelection] = useState<string>(() => {
    // Default to EVE Standard (cloud) for a fresh user; local Gemma is opt-in.
    return configService.get('commandEve.inferenceSelection') || EVE_DEFAULT_INFERENCE_SELECTION;
  });

  // Keep local state in sync with config changes from any other surface
  // (header ↔ sheet ↔ GuidPicker all read the same key).
  useEffect(() => {
    const unsubscribe = configService.subscribe('commandEve.inferenceSelection', (value) => {
      if (typeof value === 'string' && value.length > 0) setSelection(value);
    });
    return unsubscribe;
  }, []);

  const groups = useMemo(() => buildEvePickerGroups(status), [status]);
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const selectedRaw = useMemo(() => items.find((i) => i.value === selection), [items, selection]);
  const selectedItem = selectedRaw && !selectedRaw.disabled ? selectedRaw : undefined;

  const isSelectable = useCallback(
    (value: string) => {
      const item = items.find((i) => i.value === value);
      return Boolean(item && !item.disabled);
    },
    [items]
  );

  const commit = useCallback(
    (value: string) => {
      const item = items.find((i) => i.value === value);
      // Ignore unknown values and greyed (paid-only while trialing) rows.
      if (!item || item.disabled) return;
      setSelection(value);
      configService.set('commandEve.inferenceSelection', value);
      onChange?.(value);
    },
    [items, onChange]
  );

  // If trialing flips a previously-selected paid EVE tier to disabled, reset to
  // the safe default (EVE Standard) once, so no surface shows a disabled value
  // as "active".
  useEffect(() => {
    if (selectedRaw && selectedRaw.disabled) {
      const fallback = eveTierValue(EVE_INFERENCE_DEFAULT_TIER_ID);
      setSelection(fallback);
      configService.set('commandEve.inferenceSelection', fallback);
    }
  }, [selectedRaw]);

  return { selection, groups, items, selectedItem, commit, isSelectable };
}

export default useEveInferenceSelection;
