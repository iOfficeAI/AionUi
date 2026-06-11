/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

export {
  detectCommandEveSensitiveEgress,
  evaluateCommandEveEgressBoundary,
  redactCommandEveSensitiveText,
  type CommandEveEgressBoundaryInput,
  type CommandEveEgressBoundaryReceipt,
  type CommandEveEgressBoundaryResult,
  type CommandEveEgressDecision,
  type CommandEveEgressFinding,
  type CommandEveEgressFindingKind,
  type CommandEveEgressPolicyAction,
  type CommandEveEgressProvider,
  type CommandEveEgressProviderKind,
} from '@/common/api/egressBoundaryCore';

import type { CommandEveEgressBoundaryReceipt } from '@/common/api/egressBoundaryCore';

export function writeCommandEveEgressBoundaryReceipt(
  receiptPath: string,
  receipt: CommandEveEgressBoundaryReceipt
): void {
  if (!receiptPath) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tempFile = `${receiptPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, receiptPath);
}
