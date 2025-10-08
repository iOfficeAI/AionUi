/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExecApprovalRequestData, ApplyPatchApprovalRequestData } from './eventData';

// ===== UI-facing permission request payloads for Codex =====

/**
 * 权限类型枚举
 */
export enum PermissionType {
  COMMAND_EXECUTION = 'command_execution',
  FILE_WRITE = 'file_write',
  FILE_READ = 'file_read',
}

/**
 * 权限选项严重级别
 */
export enum PermissionSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 权限决策类型映射
 * 将UI选项映射到后端决策逻辑
 * 参考 Codex 源码 approved approved_for_session denied abort
 */
export const PERMISSION_DECISION_MAP = {
  allow_once: 'approved',
  allow_always: 'approved_for_session',
  reject_once: 'denied',
  reject_always: 'abort',
} as const;

export interface CodexPermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  description?: string;
  severity?: PermissionSeverity;
}

export interface CodexToolCallRawInput {
  command?: string | string[];
  cwd?: string;
  description?: string;
}

export interface CodexToolCall {
  title?: string;
  toolCallId: string;
  kind?: 'edit' | 'read' | 'fetch' | 'execute' | string;
  rawInput?: CodexToolCallRawInput;
}

// Base interface for all permission requests
export interface BaseCodexPermissionRequest {
  title?: string;
  description?: string;
  agentType?: 'codex';
  sessionId?: string;
  requestId?: string;
  options: CodexPermissionOption[];
}

// Union type for different permission request subtypes
export type CodexPermissionRequest = (BaseCodexPermissionRequest & { subtype: 'exec_approval_request'; data: ExecApprovalRequestData }) | (BaseCodexPermissionRequest & { subtype: 'apply_patch_approval_request'; data: ApplyPatchApprovalRequestData });
