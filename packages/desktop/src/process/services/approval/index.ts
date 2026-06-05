/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { mapApprovalActionToDecision, mapApprovalActionToReply, resolveEndpointUsed } from './action';
export { buildApprovalAudit } from './audit';
export {
  evaluateApprovalRules,
  filterActiveApprovalRules,
  findMatchingApprovalRules,
  sortApprovalRulesForEvaluation,
} from './evaluator';
export { matchesApprovalRule } from './matcher';
export { CHISL_APPROVAL_DB_FILENAME, resolveChislApprovalDbPath } from './paths';
export {
  appendApprovalAudit,
  createApprovalRule,
  deleteApprovalRule,
  getApprovalAudit,
  getApprovalRule,
  listApprovalAudits,
  listApprovalRules,
  openChislApprovalStore,
  updateApprovalRule,
  type ChislApprovalStore,
} from './repository';
export { CHISL_APPROVAL_TABLES, initChislApprovalSchema } from './schema';
export {
  buildSuggestedApprovalRuleInput,
  classifyPermissionCommand,
  classifyShellCommand,
  extractCommandFromPermissionPatterns,
  suggestApprovalFromCommandSafety,
} from './commandSafety';
export type {
  CommandSafetyApprovalSuggestion,
  CommandSafetyClassification,
  CommandSafetyContext,
  CommandSafetyDecision,
  CommandSafetyHazard,
  CommandSafetyHazardKind,
} from './commandSafety';
export type {
  ApprovalAudit,
  ApprovalAuditRow,
  ApprovalCompositeMatcher,
  ApprovalCompositeOperator,
  ApprovalDecisionKind,
  ApprovalEndpointUsed,
  ApprovalEvaluationContext,
  ApprovalEvaluationResult,
  ApprovalLeafMatcher,
  ApprovalMatchMode,
  ApprovalMatcher,
  ApprovalMatcherField,
  ApprovalMatcherType,
  ApprovalReplySent,
  ApprovalRule,
  ApprovalRuleAction,
  ApprovalRuleCreate,
  ApprovalRuleRow,
  ApprovalRuleScope,
  ApprovalRuleUpdate,
  ChislPermissionRequest,
} from './types';
