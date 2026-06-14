/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/platform/acpTypes';

// Some ACP agents (e.g. CodeBuddy) report each model twice with a status
// suffix on the id ("glm-5.1/enabled", "glm-5.1/disabled") and label
// ("GLM-5.1 (enabled)"). AionUi switches models by the clean id, so the
// suffixed entries break matching and duplicate the selector (issue #3297).
const ID_STATUS_SUFFIX = /\/(enabled|disabled)$/i;
const LABEL_STATUS_SUFFIX = /\s*\((enabled|disabled)\)$/i;

export const normalizeAcpModelId = (id: string): string => id.replace(ID_STATUS_SUFFIX, '');

const normalizeLabel = (label: string | null | undefined): string | null | undefined =>
  label == null ? label : label.replace(LABEL_STATUS_SUFFIX, '');

/**
 * Strips `/enabled` `/disabled` status suffixes from model ids/labels and
 * deduplicates the list by clean id. Entries whose raw id was suffixed
 * `/enabled` win over `/disabled` duplicates; otherwise first entry wins.
 */
export function normalizeAcpModelInfo(info: AcpModelInfo): AcpModelInfo;
export function normalizeAcpModelInfo(info: AcpModelInfo | null): AcpModelInfo | null;
export function normalizeAcpModelInfo(info: AcpModelInfo | null): AcpModelInfo | null {
  if (!info) return info;

  const byId = new Map<string, { id: string; label: string; fromDisabled: boolean }>();
  for (const model of info.available_models ?? []) {
    const id = normalizeAcpModelId(model.id);
    const fromDisabled = /\/disabled$/i.test(model.id);
    const existing = byId.get(id);
    if (existing && !(existing.fromDisabled && !fromDisabled)) continue;
    byId.set(id, { id, label: normalizeLabel(model.label) || id, fromDisabled });
  }

  return {
    ...info,
    current_model_id: info.current_model_id ? normalizeAcpModelId(info.current_model_id) : info.current_model_id,
    current_model_label: normalizeLabel(info.current_model_label) ?? info.current_model_label,
    available_models: Array.from(byId.values(), ({ id, label }) => ({ id, label })),
  };
}
