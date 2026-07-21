/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type PermissionIntent = 'allow-once' | 'allow-always' | 'reject-once' | 'reject-always' | 'neutral';

export type PermissionOperationKind = 'execute' | 'edit' | 'read' | 'fetch' | 'tool';

export type PermissionPanelOption = {
  id: string;
  value: string;
  label: string;
  intent: PermissionIntent;
  testId: string;
  disabled?: boolean;
};

export const classifyLegacyPermission = (value: string): PermissionIntent => {
  switch (value) {
    case 'proceed_once':
    case 'allow_once':
      return 'allow-once';
    case 'proceed_always':
    case 'proceed_always_server':
    case 'proceed_always_tool':
    case 'allow_always':
      return 'allow-always';
    case 'cancel':
    case 'deny':
    case 'reject_once':
      return 'reject-once';
    case 'reject_always':
      return 'reject-always';
    default:
      return 'neutral';
  }
};

export const classifyAcpPermission = (kind: string): PermissionIntent => {
  switch (kind) {
    case 'allow_once':
      return 'allow-once';
    case 'allow_always':
      return 'allow-always';
    case 'reject_once':
      return 'reject-once';
    case 'reject_always':
      return 'reject-always';
    default:
      return 'neutral';
  }
};

export const normalizePermissionOperationKind = (kind?: string): PermissionOperationKind => {
  switch (kind) {
    case 'exec':
    case 'execute':
      return 'execute';
    case 'edit':
      return 'edit';
    case 'info':
    case 'read':
      return 'read';
    case 'fetch':
      return 'fetch';
    default:
      return 'tool';
  }
};

export const getSafePermissionOptionId = (options: PermissionPanelOption[]): string | null =>
  options.find((option) => option.intent === 'allow-once' && !option.disabled)?.id ?? null;

export const getPermissionOptionsIdentity = (options: PermissionPanelOption[]): string =>
  JSON.stringify(options.map(({ id, value, intent, disabled }) => [id, value, intent, Boolean(disabled)]));
