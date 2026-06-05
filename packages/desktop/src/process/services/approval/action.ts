/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ApprovalDecisionKind,
  ApprovalEndpointUsed,
  ApprovalReplySent,
  ApprovalRuleAction,
} from './types';

export function mapApprovalActionToReply(action: ApprovalRuleAction | null): ApprovalReplySent {
  switch (action) {
    case 'allow':
      return 'once';
    case 'deny':
      return 'reject';
    case 'ask':
      return 'none';
    default:
      return 'reject';
  }
}

export function mapApprovalActionToDecision(action: ApprovalRuleAction | null): ApprovalDecisionKind {
  switch (action) {
    case 'allow':
      return 'allow';
    case 'deny':
      return 'deny';
    case 'ask':
      return 'manual';
    default:
      return 'fallback';
  }
}

export function resolveEndpointUsed(replySent: ApprovalReplySent): ApprovalEndpointUsed {
  if (replySent === 'none') return 'none';
  return 'preferred';
}
