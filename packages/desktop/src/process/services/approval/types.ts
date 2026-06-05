/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ApprovalRuleScope = 'session' | 'workspace' | 'global';

export type ApprovalRuleAction = 'allow' | 'deny' | 'ask';

export type ApprovalMatcherType = 'exact' | 'glob' | 'regex' | 'prefix' | 'jsonpath' | 'composite';

export type ApprovalMatchMode = 'any' | 'all';

export type ApprovalMatcherField = 'permission' | 'patterns' | 'sessionID' | 'id' | 'metadata';

export type ApprovalCompositeOperator = 'and' | 'or';

export type ApprovalLeafMatcher = {
  type: Exclude<ApprovalMatcherType, 'composite'>;
  field: ApprovalMatcherField;
  patterns?: string[];
  matchMode?: ApprovalMatchMode;
  path?: string;
};

export type ApprovalCompositeMatcher = {
  type: 'composite';
  operator: ApprovalCompositeOperator;
  children: ApprovalMatcher[];
};

export type ApprovalMatcher = ApprovalLeafMatcher | ApprovalCompositeMatcher;

export type ApprovalRule = {
  id: string;
  name: string;
  scope: ApprovalRuleScope;
  scopeRef?: string;
  tool?: string;
  matcher: ApprovalMatcher;
  action: ApprovalRuleAction;
  priority: number;
  expiry?: number;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  reason?: string;
  tags: string[];
};

export type ChislPermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata?: Record<string, unknown>;
  tool?: string;
};

export type ApprovalEvaluationContext = {
  sessionID: string;
  workspaceRef?: string;
  principal?: string;
};

export type ApprovalDecisionKind = 'allow' | 'deny' | 'manual' | 'fallback';

export type ApprovalReplySent = 'once' | 'reject' | 'none';

export type ApprovalEndpointUsed = 'preferred' | 'deprecated' | 'none';

export type ApprovalEvaluationResult = {
  decision: ApprovalDecisionKind;
  action: ApprovalRuleAction | null;
  rule: ApprovalRule | null;
  replySent: ApprovalReplySent;
  endpointUsed: ApprovalEndpointUsed;
  reason: string;
  evaluationMs: number;
};

export type ApprovalAudit = {
  id?: string;
  requestId: string;
  sessionId: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown> | null;
  decision: ApprovalDecisionKind;
  ruleId?: string;
  ruleName?: string;
  ruleScope?: ApprovalRuleScope;
  replySent: ApprovalReplySent;
  endpointUsed: ApprovalEndpointUsed;
  reason: string;
  evaluatedAt: number;
  evaluationMs: number;
  principal?: string;
  ruleSnapshot?: ApprovalRule;
};

export type ApprovalRuleRow = {
  id: string;
  name: string;
  scope: ApprovalRuleScope;
  scope_ref: string | null;
  tool: string | null;
  matcher_json: string;
  action: ApprovalRuleAction;
  priority: number;
  expiry: number | null;
  enabled: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  reason: string | null;
  tags_json: string;
};

export type ApprovalAuditRow = {
  id: string;
  request_id: string;
  session_id: string;
  permission: string;
  patterns_json: string;
  metadata_json: string | null;
  decision: ApprovalDecisionKind;
  rule_id: string | null;
  rule_name: string | null;
  rule_scope: ApprovalRuleScope | null;
  reply_sent: ApprovalReplySent;
  endpoint_used: ApprovalEndpointUsed;
  reason: string;
  evaluated_at: number;
  evaluation_ms: number;
  principal: string | null;
  rule_snapshot_json: string | null;
};

export type ApprovalRuleCreate = {
  id?: string;
  name: string;
  scope: ApprovalRuleScope;
  scopeRef?: string;
  tool?: string;
  matcher: ApprovalMatcher;
  action: ApprovalRuleAction;
  priority?: number;
  expiry?: number;
  enabled?: boolean;
  createdBy: string;
  reason?: string;
  tags?: string[];
};

export type ApprovalRuleUpdate = Partial<
  Pick<
    ApprovalRule,
    | 'name'
    | 'scope'
    | 'scopeRef'
    | 'tool'
    | 'matcher'
    | 'action'
    | 'priority'
    | 'expiry'
    | 'enabled'
    | 'reason'
    | 'tags'
  >
>;
