/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type LegacyAcpModelSourceInfo = {
  source?: string;
  source_detail?: string;
};

/**
 * @deprecated No longer used — source/source_detail removed from AcpModelInfo.
 */
export function getAcpModelSourceLabel(model_info: LegacyAcpModelSourceInfo | null): string {
  const source_detail = model_info?.source_detail;
  if (source_detail === 'cc-switch') return 'cc-switch';
  // if (source_detail === 'acp-config-option') return 'ACP config';
  // if (source_detail === 'acp-models') return 'ACP models';
  // if (source_detail === 'persisted-model') return 'saved model';
  // if (source_detail === 'codex-stream') return 'Codex stream';

  // if (model_info?.source === 'configOption') return 'ACP config';
  // if (model_info?.source === 'models') return 'ACP models';
  return '';
}

/**
 * @deprecated No longer used.
 */
export function formatAcpModelDisplayLabel(modelLabel: string, sourceLabel: string): string {
  if (!sourceLabel) return modelLabel;
  if (!modelLabel) return sourceLabel;
  return `${modelLabel} · ${sourceLabel}`;
}
